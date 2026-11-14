"""Clima diario desde NASA POWER (API oficial de NASA, sin clave).

POWER tiene una grilla gruesa (0.5 grados de latitud x 0.625 de longitud), asi que
no se consulta por celda H3: se "ajusta" (snap) cada celda al punto POWER mas
cercano y se baja una sola serie por punto (unos 80 puntos para Catamarca).

Uso:
    python -m pipeline.weather --start 2012-01-01
Genera:
    data/raw/power/<lat>_<lon>.parquet      (serie cruda por punto, reanudable)
    data/processed/weather_points.parquet   (clima + variables derivadas por punto/fecha)
    data/processed/cell_point.parquet       (mapa h3_cell -> point_id)
"""
import argparse
import time
from datetime import date, timedelta

import numpy as np
import pandas as pd
import requests

from pipeline import config

POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
PARAMS = ["T2M", "T2M_MAX", "RH2M", "PRECTOTCORR", "WS2M"]
LAT_STEP, LON_STEP = 0.5, 0.625
RAW_POWER = config.DATA / "raw" / "power"
RAW_POWER.mkdir(parents=True, exist_ok=True)

RENAME = {
    "T2M": "temp_c",
    "T2M_MAX": "temp_max_c",
    "RH2M": "humedad_pct",
    "PRECTOTCORR": "precip_mm",
    "WS2M": "viento_ms",
}


def snap(lat, lon):
    """Punto de la grilla POWER mas cercano."""
    return (np.round(np.asarray(lat) / LAT_STEP) * LAT_STEP,
            np.round(np.asarray(lon) / LON_STEP) * LON_STEP)


def point_id(plat: float, plon: float) -> str:
    return f"{plat:.3f}_{plon:.3f}"


def parse_power(js: dict) -> pd.DataFrame:
    par = js["properties"]["parameter"]
    df = pd.DataFrame({k: pd.Series(v) for k, v in par.items()})
    df.index = pd.to_datetime(df.index, format="%Y%m%d")
    df.index.name = "fecha"
    df = df.replace(-999, np.nan).rename(columns=RENAME)
    df["viento_kmh"] = df["viento_ms"] * 3.6
    return df.drop(columns=["viento_ms"]).reset_index()


def derive(df: pd.DataFrame) -> pd.DataFrame:
    """Variables derivadas relevantes para riesgo de incendio."""
    df = df.sort_values("fecha").reset_index(drop=True).copy()
    wet = df["precip_mm"].fillna(0) >= 1.0
    grp = wet.cumsum()
    df["dias_sin_lluvia"] = (~wet).groupby(grp).cumsum().astype(int)
    df["precip_30d"] = df["precip_mm"].rolling(30, min_periods=20).sum()
    df["precip_90d"] = df["precip_mm"].rolling(90, min_periods=60).sum()
    df["temp_7d"] = df["temp_c"].rolling(7, min_periods=5).mean()
    df["humedad_7d"] = df["humedad_pct"].rolling(7, min_periods=5).mean()
    # Deficit de presion de vapor (kPa): aire seco y caliente = combustible mas seco.
    es = 0.6108 * np.exp(17.27 * df["temp_c"] / (df["temp_c"] + 237.3))
    df["vpd_kpa"] = es * (1 - df["humedad_pct"] / 100.0)
    # Anomalias respecto del promedio de cada dia del anio.
    doy = df["fecha"].dt.day_of_year
    df["temp_anom"] = df["temp_c"] - df.groupby(doy)["temp_c"].transform("mean")
    df["humedad_anom"] = df["humedad_pct"] - df.groupby(doy)["humedad_pct"].transform("mean")
    return df


def fetch_point(plat: float, plon: float, start: date, end: date, retries: int = 4) -> pd.DataFrame:
    params = {
        "start": start.strftime("%Y%m%d"),
        "end": end.strftime("%Y%m%d"),
        "latitude": plat,
        "longitude": plon,
        "community": "AG",
        "parameters": ",".join(PARAMS),
        "format": "JSON",
    }
    for attempt in range(retries):
        try:
            r = requests.get(POWER_URL, params=params, timeout=120)
            if r.status_code == 200:
                return parse_power(r.json())
            if r.status_code in (400, 422):
                raise RuntimeError(f"POWER rechazo el pedido ({r.status_code}): {r.text[:200]!r}")
            wait = 2 ** attempt * 5
            print(f"  HTTP {r.status_code} en punto {plat},{plon}, reintento en {wait}s")
        except requests.RequestException as exc:
            wait = 2 ** attempt * 5
            print(f"  Error de red ({exc.__class__.__name__}), reintento en {wait}s")
        time.sleep(wait)
    raise RuntimeError(f"No se pudo bajar el punto {plat},{plon}")


def build_points(grid: pd.DataFrame) -> pd.DataFrame:
    plat, plon = snap(grid["lat"].to_numpy(), grid["lon"].to_numpy())
    out = grid[["h3_cell"]].copy()
    out["plat"], out["plon"] = plat, plon
    out["point_id"] = [point_id(a, b) for a, b in zip(plat, plon)]
    return out


def run(start: date, end: date):
    grid = pd.read_parquet(config.PROCESSED / "grid.parquet")[["h3_cell", "lat", "lon"]]
    cells = build_points(grid)
    cells[["h3_cell", "point_id"]].to_parquet(config.PROCESSED / "cell_point.parquet", index=False)
    pts = cells.drop_duplicates("point_id")[["point_id", "plat", "plon"]].reset_index(drop=True)
    print(f"{len(grid)} celdas -> {len(pts)} puntos POWER")

    partes = []
    for i, row in pts.iterrows():
        f = RAW_POWER / f"{row.point_id}.parquet"
        if f.exists():
            df = pd.read_parquet(f)
        else:
            df = fetch_point(row.plat, row.plon, start, end)
            df.to_parquet(f, index=False)
            time.sleep(1.0)
        df = derive(df)
        df.insert(0, "point_id", row.point_id)
        partes.append(df)
        if (i + 1) % 10 == 0:
            print(f"  {i + 1}/{len(pts)} puntos")
    out = pd.concat(partes, ignore_index=True)
    dest = config.PROCESSED / "weather_points.parquet"
    out.to_parquet(dest, index=False)
    print(f"Clima: {out.shape} guardado en {dest}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2012-01-01")
    ap.add_argument("--end", default=(date.today() - timedelta(days=4)).isoformat())
    a = ap.parse_args()
    run(date.fromisoformat(a.start), date.fromisoformat(a.end))


if __name__ == "__main__":
    main()
