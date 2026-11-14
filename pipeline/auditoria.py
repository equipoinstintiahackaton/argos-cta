"""Auditoria de calidad de los datos extraidos (focos FIRMS y clima NASA POWER).

Cada chequeo devuelve un estado: ok, aviso o error. Los errores indican que los datos
no son confiables para entrenar o mostrar; los avisos, que hay limitaciones a tener en
cuenta. Nada se "corrige" en silencio: todo queda en el reporte.

Chequeos:
  1. Descarga completa: no faltan ventanas de 5 dias entre el primer y el ultimo CSV de cada fuente.
  2. Cobertura anual: ningun anio con muchos menos focos que la mediana.
  3. Rachas sin ningun foco en temporada (agosto a noviembre), posibles huecos de descarga.
  4. Homogeneidad de sensores: cambios en la cantidad de satelites VIIRS entre anios.
  5. Duplicados residuales: focos distintos a menos de 1 km y 3 h (la deduplicacion los uniria).
  6. Campos: coordenadas fuera de la provincia, nulos, valores fisicamente imposibles.
  7. Clima: nulos, rangos fisicos, dias faltantes por punto, frescura.
  8. (opcional) Contra FIRMS: se vuelven a pedir ventanas al azar y se comparan filas.

Uso:
    python -m pipeline.auditoria
    python -m pipeline.auditoria --contra-firms 6
"""
import argparse
import json
import re
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

from pipeline import config

TEMPORADA = (8, 9, 10, 11)
RACHA_MIN_DIAS = 10
RANGOS_CLIMA = {
    "temp_c": (-30, 50), "temp_max_c": (-25, 55), "humedad_pct": (0, 100),
    "viento_kmh": (0, 200), "precip_mm": (0, 500),
}
VENTANA = re.compile(r"^(\d{4}-\d{2}-\d{2})_(\d+)d\.csv$")


def chequeo(estado: str, nombre: str, detalle: str) -> dict:
    return {"chequeo": nombre, "estado": estado, "detalle": detalle}


# ---------------------------------------------------------------- 1. descarga
def huecos_descarga(carpeta: Path) -> list:
    """Ventanas de dias que faltan entre los CSV de una fuente (nombre AAAA-MM-DD_Nd.csv)."""
    ventanas = []
    for f in carpeta.glob("*.csv"):
        m = VENTANA.match(f.name)
        if m:
            ini = date.fromisoformat(m.group(1))
            ventanas.append((ini, ini + timedelta(days=int(m.group(2)) - 1)))
    ventanas.sort()
    huecos = []
    for (_, fin_a), (ini_b, _) in zip(ventanas, ventanas[1:]):
        if ini_b > fin_a + timedelta(days=1):
            huecos.append((fin_a + timedelta(days=1), ini_b - timedelta(days=1)))
    return huecos


def chequeo_descarga(raw_root: Path) -> list:
    out = []
    if not raw_root.exists():
        return out
    for carpeta in sorted(p for p in raw_root.iterdir() if p.is_dir()):
        h = huecos_descarga(carpeta)
        n = len(list(carpeta.glob("*.csv")))
        if h:
            ej = ", ".join(f"{a} a {b}" for a, b in h[:3])
            out.append(chequeo("error", f"descarga {carpeta.name}",
                               f"{len(h)} hueco(s) entre ventanas, por ejemplo {ej}. Repetir la descarga."))
        else:
            out.append(chequeo("ok", f"descarga {carpeta.name}", f"{n} ventanas, sin huecos"))
    return out


# ---------------------------------------------------------------- 2-4 cobertura
def sensor_de(f: pd.DataFrame) -> pd.Series:
    return f["instrumento"].astype(str) + ":" + f["satelite"].astype(str)


def cobertura_focos(focos: pd.DataFrame) -> pd.DataFrame:
    f = focos.copy()
    f["fecha"] = pd.to_datetime(f["fecha_utc"])
    f["anio"] = f["fecha"].dt.year
    f["sensor"] = sensor_de(f)
    g = f.groupby(["anio", "sensor"]).agg(focos=("fecha", "size"), dias_con_focos=("fecha", "nunique"))
    return g.reset_index()


def rachas_sin_datos(fechas, desde, hasta, meses=TEMPORADA, min_dias=RACHA_MIN_DIAS) -> list:
    """Rachas de dias consecutivos, dentro de la temporada, sin ninguna deteccion."""
    dias = pd.date_range(desde, hasta)
    dias = dias[dias.month.isin(meses)]
    con = set(pd.to_datetime(pd.Series(list(fechas))).dt.normalize())
    faltan = pd.Series([d for d in dias if d not in con])
    if faltan.empty:
        return []
    grupo = (faltan.diff() != pd.Timedelta(days=1)).cumsum()
    out = []
    for _, g in faltan.groupby(grupo):
        if len(g) >= min_dias:
            out.append((g.iloc[0].date(), g.iloc[-1].date(), len(g)))
    return out


def chequeo_cobertura(focos: pd.DataFrame, cob: pd.DataFrame) -> list:
    out = []
    hoy_anio = date.today().year
    por_anio = cob.groupby("anio")["focos"].sum()
    completos = por_anio[por_anio.index < hoy_anio]
    if len(completos) >= 3:
        med = float(completos.median())
        bajos = completos[completos < 0.3 * med]
        if len(bajos):
            out.append(chequeo("aviso", "cobertura anual",
                               "anios con menos del 30% de la mediana de focos: "
                               + ", ".join(f"{int(a)} ({int(n)})" for a, n in bajos.items())
                               + ". Pueden ser anios de pocos incendios o datos incompletos."))
        else:
            out.append(chequeo("ok", "cobertura anual",
                               f"{len(completos)} anios completos, mediana {int(med)} focos por anio"))
    else:
        out.append(chequeo("aviso", "cobertura anual", "menos de 3 anios completos para comparar"))

    fechas = pd.to_datetime(focos["fecha_utc"])
    rachas = rachas_sin_datos(fechas, fechas.min(), fechas.max())
    if rachas:
        ej = ", ".join(f"{a} a {b} ({n} dias)" for a, b, n in rachas[:3])
        out.append(chequeo("aviso", "rachas sin focos en temporada",
                           f"{len(rachas)} racha(s) de {RACHA_MIN_DIAS}+ dias sin ningun foco entre agosto y "
                           f"noviembre, por ejemplo {ej}. Verificar que no sea un hueco de descarga."))
    else:
        out.append(chequeo("ok", "rachas sin focos en temporada",
                           f"ninguna racha de {RACHA_MIN_DIAS}+ dias sin focos entre agosto y noviembre"))

    viirs = cob[cob["sensor"].str.startswith("VIIRS")]
    if len(viirs):
        n_sat = viirs.groupby("anio")["sensor"].nunique()
        if n_sat.nunique() > 1:
            cambios = [f"{int(a)}: {int(n)}" for a, n in n_sat.items()]
            out.append(chequeo("aviso", "homogeneidad VIIRS",
                               "la cantidad de satelites VIIRS cambia entre anios (" + ", ".join(cambios)
                               + "). Los conteos de focos no son comparables entre anios sin ese ajuste."))
        else:
            out.append(chequeo("ok", "homogeneidad VIIRS", "misma cantidad de satelites VIIRS todos los anios"))
    return out


# ---------------------------------------------------------------- 5. duplicados
def duplicados_residuales(focos: pd.DataFrame, radio_m=config.DEDUP_RADIUS_M,
                          ventana_h=config.DEDUP_WINDOW_H) -> int:
    f = focos[["lat", "lon", "ts_utc"]].copy()
    f["ts_utc"] = pd.to_datetime(f["ts_utc"], utc=True)
    f["dia"] = f["ts_utc"].dt.normalize()
    total = 0
    for _, g in f.groupby("dia"):
        if len(g) < 2:
            continue
        x = np.radians(g["lon"].to_numpy()) * 6371000 * np.cos(np.radians(g["lat"].to_numpy()))
        y = np.radians(g["lat"].to_numpy()) * 6371000
        t = g["ts_utc"].astype("int64").to_numpy() / 3.6e12   # horas
        for i, j in cKDTree(np.c_[x, y]).query_pairs(radio_m):
            if abs(t[i] - t[j]) <= ventana_h:
                total += 1
    return total


# ---------------------------------------------------------------- 6. campos
def chequeo_campos(focos: pd.DataFrame) -> list:
    out = []
    n = len(focos)
    w, s, e, no = config.CATAMARCA_BBOX
    fuera = int(((focos["lon"] < w) | (focos["lon"] > e) | (focos["lat"] < s) | (focos["lat"] > no)).sum())
    out.append(chequeo("error" if fuera else "ok", "coordenadas",
                       f"{fuera} focos fuera del recuadro de Catamarca" if fuera else "todas dentro del recuadro de Catamarca"))
    dup = int(focos.duplicated(["lat", "lon", "ts_utc", "instrumento", "satelite"]).sum())
    out.append(chequeo("error" if dup else "ok", "filas repetidas",
                       f"{dup} filas con mismo lugar, hora y satelite" if dup else "sin filas repetidas"))
    nul = {c: float(focos[c].isna().mean()) for c in ("brillo_k", "frp_mw", "confianza_cat", "ts_utc") if c in focos}
    malos = {c: v for c, v in nul.items() if v > 0.01}
    out.append(chequeo("aviso" if malos else "ok", "campos nulos",
                       ", ".join(f"{c} {v:.1%}" for c, v in malos.items()) + " de nulos" if malos
                       else "brillo, FRP, confianza y hora con menos de 1% de nulos"))
    imposibles = []
    if (focos["frp_mw"] < 0).any():
        imposibles.append(f"{int((focos['frp_mw'] < 0).sum())} con FRP negativo")
    b = focos["brillo_k"].dropna()
    if ((b < 250) | (b > 700)).any():
        imposibles.append(f"{int(((b < 250) | (b > 700)).sum())} con brillo fuera de 250 a 700 K")
    fut = int((pd.to_datetime(focos["ts_utc"], utc=True) > pd.Timestamp.now(tz="UTC") + pd.Timedelta(days=1)).sum())
    if fut:
        imposibles.append(f"{fut} con fecha futura")
    out.append(chequeo("error" if imposibles else "ok", "valores imposibles",
                       "; ".join(imposibles) if imposibles else "ninguno"))
    return out


# ---------------------------------------------------------------- 7. clima
def chequeo_clima(clima: pd.DataFrame, focos_fin: pd.Timestamp | None = None) -> list:
    out = []
    c = clima.copy()
    c["fecha"] = pd.to_datetime(c["fecha"]).dt.normalize()
    malos = []
    for v, (lo, hi) in RANGOS_CLIMA.items():
        if v in c:
            k = int(((c[v] < lo) | (c[v] > hi)).sum())
            if k:
                malos.append(f"{v}: {k} fuera de [{lo}, {hi}]")
    out.append(chequeo("error" if malos else "ok", "clima rangos fisicos",
                       "; ".join(malos) if malos else "todas las variables dentro de rangos fisicos"))
    cols = [v for v in RANGOS_CLIMA if v in c]
    nul = {v: float(c[v].isna().mean()) for v in cols if c[v].isna().mean() > 0.01}
    out.append(chequeo("aviso" if nul else "ok", "clima nulos",
                       ", ".join(f"{v} {p:.1%}" for v, p in nul.items()) + " de nulos" if nul
                       else "menos de 1% de nulos en cada variable"))
    ini, fin = c["fecha"].min(), c["fecha"].max()
    esperados = (fin - ini).days + 1
    con = c.dropna(subset=["temp_c"]).groupby("point_id")["fecha"].nunique()
    falta = (1 - con / esperados)
    peores = falta[falta > 0.02]
    out.append(chequeo("aviso" if len(peores) else "ok", "clima dias faltantes",
                       f"{len(peores)} de {len(con)} puntos con mas de 2% de dias faltantes "
                       f"(peor {falta.max():.1%})" if len(peores)
                       else f"{len(con)} puntos con menos de 2% de dias faltantes ({ini.date()} a {fin.date()})"))
    if focos_fin is not None:
        rezago = (focos_fin.normalize() - fin).days
        out.append(chequeo("aviso" if rezago > 7 else "ok", "frescura del clima",
                           f"el clima llega al {fin.date()}, {rezago} dias antes del ultimo foco "
                           f"({'demasiado, el riesgo actual usa datos viejos' if rezago > 7 else 'normal, NASA POWER tarda 3 a 5 dias'})"))
    return out


# ---------------------------------------------------------------- 8. contra FIRMS
def filas_csv(path: Path) -> int:
    with open(path, encoding="utf-8") as f:
        return max(0, sum(1 for _ in f) - 1)


def contra_firms(raw_root: Path, n: int, seed: int = 7) -> list:
    """Vuelve a pedir n ventanas historicas (SP) al azar y compara cantidad de filas."""
    from pipeline import ingest_firms
    rng = np.random.default_rng(seed)
    archivos = [f for d in raw_root.iterdir() if d.is_dir() and d.name.endswith("_SP")
                for f in d.glob("*.csv") if VENTANA.match(f.name)]
    out = []
    if not archivos:
        return [chequeo("aviso", "contra FIRMS", "no hay ventanas historicas (SP) para comparar")]
    for i in rng.choice(len(archivos), size=min(n, len(archivos)), replace=False):
        f = archivos[int(i)]
        m = VENTANA.match(f.name)
        try:
            texto = ingest_firms.fetch_window(f.parent.name, date.fromisoformat(m.group(1)), int(m.group(2)))
        except Exception as exc:   # red o clave: se informa, no se oculta
            out.append(chequeo("aviso", f"contra FIRMS {f.parent.name} {m.group(1)}", f"no se pudo consultar: {exc}"))
            continue
        remoto = max(0, texto.count("\n") - 1) if texto.lstrip().lower().startswith("latitude") else -1
        local = filas_csv(f)
        ok = remoto == local
        out.append(chequeo("ok" if ok else "error", f"contra FIRMS {f.parent.name} {m.group(1)}",
                           f"{local} filas locales, {remoto} en FIRMS" + ("" if ok else ": NO COINCIDEN")))
    return out


# ---------------------------------------------------------------- embudo
def embudo(raw_root: Path, focos: pd.DataFrame) -> list:
    if not raw_root.exists():
        return []
    filas = {d.name: sum(filas_csv(f) for f in d.glob("*.csv")) for d in sorted(raw_root.iterdir()) if d.is_dir()}
    total = sum(filas.values())
    detalle = ", ".join(f"{k} {v}" for k, v in filas.items())
    pct = f"{len(focos) / total:.0%}" if total else "s/d"
    return [chequeo("ok", "embudo de datos",
                    f"{total} detecciones crudas ({detalle}) -> {len(focos)} focos finales ({pct}) "
                    "tras filtrar tipo, fuentes fijas, deduplicar y recortar a Catamarca")]


def auditar(focos: pd.DataFrame, clima: pd.DataFrame | None, raw_root: Path | None = None,
            n_firms: int = 0) -> dict:
    checks = []
    if raw_root is not None:
        checks += chequeo_descarga(raw_root)
    cob = cobertura_focos(focos)
    checks += chequeo_cobertura(focos, cob)
    d = duplicados_residuales(focos)
    checks.append(chequeo("error" if d > 0.005 * len(focos) else ("aviso" if d else "ok"), "duplicados residuales",
                          f"{d} pares de focos a menos de {config.DEDUP_RADIUS_M} m y {config.DEDUP_WINDOW_H} h"))
    checks += chequeo_campos(focos)
    if clima is not None:
        checks += chequeo_clima(clima, pd.to_datetime(focos["fecha_utc"]).max())
    if raw_root is not None:
        checks += embudo(raw_root, focos)
        if n_firms:
            checks += contra_firms(raw_root, n_firms)
    return {"checks": checks, "cobertura": cob}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--contra-firms", type=int, default=0, help="cuantas ventanas volver a pedir a FIRMS")
    a = ap.parse_args()
    focos = pd.read_parquet(config.PROCESSED / "focos.parquet")
    wp = config.PROCESSED / "weather_points.parquet"
    clima = pd.read_parquet(wp) if wp.exists() else None
    res = auditar(focos, clima, config.RAW_FIRMS, a.contra_firms)
    marca = {"ok": "OK   ", "aviso": "AVISO", "error": "ERROR"}
    for c in res["checks"]:
        print(f"[{marca[c['estado']]}] {c['chequeo']}: {c['detalle']}")
    cuenta = pd.Series([c["estado"] for c in res["checks"]]).value_counts()
    print(f"\nResumen: {int(cuenta.get('ok', 0))} ok, {int(cuenta.get('aviso', 0))} avisos, "
          f"{int(cuenta.get('error', 0))} errores")
    print("\nFocos por anio y sensor:")
    print(res["cobertura"].pivot(index="anio", columns="sensor", values="focos").fillna(0).astype(int).to_string())
    res["cobertura"].to_parquet(config.PROCESSED / "auditoria_cobertura.parquet", index=False)
    (config.PROCESSED / "auditoria.json").write_text(json.dumps(res["checks"], ensure_ascii=False, indent=1))
    print(f"\nGuardado en {config.PROCESSED}")


if __name__ == "__main__":
    main()
