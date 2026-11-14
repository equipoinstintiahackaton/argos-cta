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
    t_s = df["ts_utc"].astype("int64").to_numpy() / 1e9
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
    rep = df.drop_duplicates("grupo", keep="first").set_index("grupo")
    rep = rep.join(agg_n).join(agg_src).reset_index(drop=True)
    return rep


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
    dedup = deduplicate(todo)
    final = finalize(dedup)
    out = config.PROCESSED / "focos.parquet"
    final.to_parquet(out, index=False)
    print(f"Total: {antes} -> {len(final)} focos tras deduplicar. Guardado en {out}")
    return final


if __name__ == "__main__":
    run()
