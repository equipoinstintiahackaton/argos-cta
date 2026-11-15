"""Armonizacion de focos MODIS y VIIRS a un esquema unico, con deduplicacion.

Diferencias que se resuelven aca:
- Temperatura de brillo: MODIS usa `brightness` (banda 21/22), VIIRS usa `bright_ti4` (I4).
- Confianza: MODIS es numerica 0-100; VIIRS es categorica l/n/h. Se unifica en
  baja / nominal / alta (cortes MODIS segun documentacion FIRMS: <30, 30-79, >=80).
- Resolucion: MODIS ~1 km, VIIRS ~375 m. Se guarda `res_m` por registro.
- Hora: acq_time viene como HHMM en UTC; se convierte a datetime UTC y local.
- Duplicados: el mismo evento suele ser visto por varios sensores/pasadas.
  Se agrupan detecciones cercanas en espacio (<= DEDUP_RADIUS_M) y tiempo
  (<= DEDUP_WINDOW_H) y se conserva un registro representativo por grupo.
"""
import json
from pathlib import Path

import h3
import numpy as np
import pandas as pd
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

from pipeline import config

COLUMNAS_FINALES = [
    "foco_id", "lat", "lon", "fecha_utc", "ts_utc", "ts_local", "hora_local",
    "instrumento", "satelite", "res_m", "brillo_k", "frp_mw", "confianza_cat",
    "confianza_num", "dia_noche", "h3_cell", "n_detecciones", "fuentes",
    "frp_total_mw", "n_pixeles",
]


def _read_raw(source_dir: Path) -> pd.DataFrame:
    files = sorted(source_dir.glob("*.csv"))
    if not files:
        return pd.DataFrame()
    frames = [pd.read_csv(f, dtype={"acq_time": str}) for f in files]
    return pd.concat(frames, ignore_index=True)


def _confianza_modis(v: pd.Series) -> pd.Series:
    num = pd.to_numeric(v, errors="coerce")
    cat = pd.cut(num, bins=[-1, 29, 79, 100], labels=["baja", "nominal", "alta"])
    return cat.astype(object), num


def _confianza_viirs(v: pd.Series) -> pd.Series:
    mapa = {"l": "baja", "n": "nominal", "h": "alta"}
    cat = v.astype(str).str.lower().map(mapa)
    return cat, pd.Series(np.nan, index=v.index)


def normalize(df: pd.DataFrame, instrumento: str) -> pd.DataFrame:
    """Lleva un DataFrame crudo FIRMS (MODIS o VIIRS) al esquema comun."""
    if df.empty:
        return pd.DataFrame()
    inst = instrumento.upper()
    out = pd.DataFrame()
    out["lat"] = pd.to_numeric(df["latitude"], errors="coerce")
    out["lon"] = pd.to_numeric(df["longitude"], errors="coerce")

    hhmm = df["acq_time"].astype(str).str.zfill(4)
    out["ts_utc"] = pd.to_datetime(
        df["acq_date"].astype(str) + " " + hhmm.str[:2] + ":" + hhmm.str[2:],
        utc=True, errors="coerce",
    )

    if inst == "MODIS":
        out["brillo_k"] = pd.to_numeric(df["brightness"], errors="coerce")
        out["confianza_cat"], out["confianza_num"] = _confianza_modis(df["confidence"])
        out["res_m"] = 1000
    else:
        out["brillo_k"] = pd.to_numeric(df["bright_ti4"], errors="coerce")
        out["confianza_cat"], out["confianza_num"] = _confianza_viirs(df["confidence"])
        out["res_m"] = 375

    out["frp_mw"] = pd.to_numeric(df["frp"], errors="coerce")
    # FIRMS: 0 = incendio de vegetacion presunto, 1 = volcan activo, 2 = otra fuente fija, 3 = costa afuera
    out["tipo"] = pd.to_numeric(df["type"], errors="coerce") if "type" in df.columns else np.nan
    out["instrumento"] = inst
    out["satelite"] = df["satellite"].astype(str)
    out["dia_noche"] = df["daynight"].astype(str).str.upper()
    return out.dropna(subset=["lat", "lon", "ts_utc"]).reset_index(drop=True)


def _to_xy_m(lat: np.ndarray, lon: np.ndarray):
    """Proyeccion plana aproximada (equirectangular) en metros. Suficiente para 1 km."""
    lat0 = np.deg2rad(np.nanmean(lat))
    x = np.deg2rad(lon) * 6371000.0 * np.cos(lat0)
    y = np.deg2rad(lat) * 6371000.0
    return x, y


def deduplicate(df: pd.DataFrame) -> pd.DataFrame:
    """Agrupa detecciones del mismo evento y deja un registro por grupo.

    Se arma un espacio 3D (x, y, tiempo) donde el tiempo se escala para que
    DEDUP_WINDOW_H horas equivalga a DEDUP_RADIUS_M metros. Dos detecciones se
    conectan si estan dentro de ese radio; los grupos son componentes conexas.
    Representante: el de mayor resolucion (menor res_m) y, a igualdad, mayor FRP.
    """
    if df.empty:
        return df
    df = df.reset_index(drop=True)
    x, y = _to_xy_m(df["lat"].to_numpy(), df["lon"].to_numpy())
    # Segundos desde 1970 sin depender de la resolucion del datetime: desde pandas 3 la resolucion
    # por defecto es microsegundos y astype("int64") / 1e9 dejaba el tiempo casi en cero, con lo que
    # se unian detecciones cercanas en el espacio aunque fueran de dias distintos.
    t_s = ((df["ts_utc"] - pd.Timestamp("1970-01-01", tz="UTC")) / pd.Timedelta(seconds=1)).to_numpy()
    t_m = t_s / (config.DEDUP_WINDOW_H * 3600.0) * config.DEDUP_RADIUS_M
    pts = np.column_stack([x, y, t_m])

    tree = cKDTree(pts)
    pairs = tree.query_pairs(r=config.DEDUP_RADIUS_M, output_type="ndarray")
    n = len(df)
    if len(pairs):
        data = np.ones(len(pairs), dtype=np.int8)
        graph = coo_matrix((data, (pairs[:, 0], pairs[:, 1])), shape=(n, n))
        _, labels = connected_components(graph, directed=False)
    else:
        labels = np.arange(n)
    df["grupo"] = labels

    df = df.sort_values(["grupo", "res_m", "frp_mw"], ascending=[True, True, False])
    agg_n = df.groupby("grupo").size().rename("n_detecciones")
    agg_src = (
        df.groupby("grupo")["instrumento"]
        .agg(lambda s: "+".join(sorted(set(s))))
        .rename("fuentes")
    )
    # FRP total y cantidad de pixeles: solo del sensor de mayor resolucion del grupo,
    # para no contar dos veces el mismo fuego visto por MODIS y VIIRS.
    res_min = df.groupby("grupo")["res_m"].transform("min")
    best = df[df["res_m"] == res_min]
    agg_frp = best.groupby("grupo")["frp_mw"].sum().rename("frp_total_mw")
    agg_pix = best.groupby("grupo").size().rename("n_pixeles")
    rep = df.drop_duplicates("grupo", keep="first").set_index("grupo")
    rep = rep.join(agg_n).join(agg_src).join(agg_frp).join(agg_pix).reset_index(drop=True)
    return rep


def solo_vegetacion(df: pd.DataFrame) -> pd.DataFrame:
    """Descarta volcanes, fuentes fijas y costa afuera segun la clasificacion de FIRMS."""
    return df[df["tipo"].isna() | (df["tipo"] == 0)].reset_index(drop=True)


def quitar_fuentes_fijas(df: pd.DataFrame):
    """Quita bloques de ~2 km con detecciones en muchos dias y varios anios.

    Devuelve (df_filtrado, tabla_de_fuentes_fijas). Una quema agricola recurrente suma
    pocos dias por anio; una instalacion termica fija suma cientos.
    """
    vacio = pd.DataFrame(columns=["bl", "bo", "n_dias", "n_anios"])
    if df.empty:
        return df, vacio
    b = config.STATIC_BIN_DEG
    t = pd.DataFrame({
        "bl": ((df["lat"] / b).round() * b).round(4),
        "bo": ((df["lon"] / b).round() * b).round(4),
        "dia": df["ts_utc"].dt.floor("D"),
        "anio": df["ts_utc"].dt.year,
    })
    g = t.groupby(["bl", "bo"]).agg(n_dias=("dia", "nunique"), n_anios=("anio", "nunique")).reset_index()
    fijas = g[(g["n_dias"] >= config.STATIC_MIN_DIAS) & (g["n_anios"] >= config.STATIC_MIN_ANIOS)]
    fijas = fijas.sort_values("n_dias", ascending=False).reset_index(drop=True)
    if fijas.empty:
        return df, vacio
    marca = t.merge(fijas[["bl", "bo"]].assign(fija=True), on=["bl", "bo"], how="left")["fija"]
    marca = marca.fillna(False).to_numpy(dtype=bool)
    return df[~marca].reset_index(drop=True), fijas


def finalize(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=COLUMNAS_FINALES)
    df = df.copy()
    df["fecha_utc"] = df["ts_utc"].dt.date
    df["ts_local"] = df["ts_utc"].dt.tz_convert(config.LOCAL_TZ)
    df["hora_local"] = df["ts_local"].dt.hour
    df["h3_cell"] = [
        h3.latlng_to_cell(la, lo, config.H3_RES) for la, lo in zip(df["lat"], df["lon"])
    ]
    df = df.sort_values("ts_utc").reset_index(drop=True)
    df["foco_id"] = np.arange(1, len(df) + 1)
    return df[COLUMNAS_FINALES]


def run() -> pd.DataFrame:
    partes = []
    for src_dir in sorted(config.RAW_FIRMS.iterdir()):
        if not src_dir.is_dir():
            continue
        inst = "MODIS" if src_dir.name.upper().startswith("MODIS") else "VIIRS"
        raw = _read_raw(src_dir)
        norm = normalize(raw, inst)
        if not norm.empty:
            print(f"{src_dir.name}: {len(norm)} detecciones")
            partes.append(norm)
    if not partes:
        raise SystemExit("No hay CSV crudos en data/raw/firms. Corre primero ingest_firms.")
    todo = pd.concat(partes, ignore_index=True)
    antes = len(todo)
    todo = solo_vegetacion(todo)
    print(f"Filtro de tipo FIRMS: {antes - len(todo)} detecciones no-vegetacion descartadas")
    n_veg = len(todo)
    n_previo = len(todo)
    todo, fijas = quitar_fuentes_fijas(todo)
    n_previo_dedup = len(todo)
    print(f"Fuentes termicas fijas: {len(fijas)} bloques de ~2 km, {n_previo - len(todo)} detecciones descartadas")
    if len(fijas):
        print(fijas.head(8).rename(columns={"bl": "lat", "bo": "lon"}).to_string(index=False))
        fijas.to_parquet(config.PROCESSED / "fuentes_fijas.parquet", index=False)
    dedup = deduplicate(todo)
    n_dedup = len(dedup)
    final = finalize(dedup)
    g = config.PROCESSED / "grid.parquet"
    if g.exists():
        celdas = set(pd.read_parquet(g, columns=["h3_cell"])["h3_cell"])
        dentro = final["h3_cell"].isin(celdas)
        print(f"Focos fuera de Catamarca (provincias vecinas) descartados: {int((~dentro).sum())}")
        final = final[dentro].reset_index(drop=True)
    out = config.PROCESSED / "focos.parquet"
    final.to_parquet(out, index=False)
    (config.PROCESSED / "embudo.json").write_text(json.dumps({
        "crudas": int(antes), "no_vegetacion": int(antes - n_veg), "fuentes_fijas": int(n_veg - n_previo_dedup),
        "duplicados": int(n_previo_dedup - n_dedup), "fuera_catamarca": int(n_dedup - len(final)),
        "finales": int(len(final))}))
    print(f"Total: {antes} -> {len(final)} focos tras deduplicar. Guardado en {out}")
    return final


if __name__ == "__main__":
    run()
