"""Clima reciente por departamento (para la seccion Ambiente del dashboard).

Promedia, por departamento y dia, los puntos de clima de las celdas del departamento.
Toma los ultimos N dias con datos validos. Agrega la fila "Toda la provincia".
Salida: data/processed/clima_actual.parquet
"""
import argparse

import pandas as pd

from pipeline import config

COLS = ["temp_c", "temp_max_c", "humedad_pct", "viento_kmh", "precip_mm", "dias_sin_lluvia",
        "precip_30d", "precip_90d", "vpd_kpa", "temp_anom", "humedad_anom"]
TODA = "Toda la provincia"


def calcular(clima: pd.DataFrame, cell_point: pd.DataFrame, celda_depto: pd.DataFrame, dias: int = 7) -> pd.DataFrame:
    clima = clima.copy()
    clima["fecha"] = pd.to_datetime(clima["fecha"])
    validas = sorted(clima.loc[clima["temp_c"].notna(), "fecha"].unique())[-dias:]
    if not validas:
        return pd.DataFrame(columns=["fecha", "departamento"] + COLS)
    clima = clima[clima["fecha"].isin(validas)]
    m = cell_point[["h3_cell", "point_id"]].merge(celda_depto[["h3_cell", "departamento"]], on="h3_cell")
    d = m.merge(clima, on="point_id")
    por_depto = d.groupby(["departamento", "fecha"])[COLS].mean().reset_index()
    toda = d.groupby("fecha")[COLS].mean().reset_index()
    toda["departamento"] = TODA
    out = pd.concat([por_depto, toda], ignore_index=True)
    out["fecha"] = out["fecha"].dt.date
    return out[["fecha", "departamento"] + COLS]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dias", type=int, default=7)
    a = ap.parse_args()
    cols = ["point_id", "fecha"] + [c for c in COLS]
    clima = pd.read_parquet(config.PROCESSED / "weather_points.parquet")
    clima = clima[[c for c in cols if c in clima.columns]]
    cp = pd.read_parquet(config.PROCESSED / "cell_point.parquet")
    cd = pd.read_parquet(config.PROCESSED / "celda_depto.parquet")
    out = calcular(clima, cp, cd, a.dias)
    out.to_parquet(config.PROCESSED / "clima_actual.parquet", index=False)
    print(f"clima_actual: {len(out)} filas, {out['departamento'].nunique()} zonas, ultima fecha {out['fecha'].max()}")


if __name__ == "__main__":
    main()
