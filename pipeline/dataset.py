"""Dataset de entrenamiento: una fila por (celda H3, dia).

Objetivo (y): hubo al menos un foco (confianza nominal o alta) en la celda durante
los proximos HORIZON dias (t+1 .. t+HORIZON)?

Predictores, todos calculados solo con informacion hasta el dia t (sin fuga):
- Clima del punto POWER asignado a la celda (temperatura, humedad, viento, lluvia,
  dias sin lluvia, VPD, anomalias).
- Historial de fuego: focos en la celda en los ultimos 7/30/90 dias, focos en las
  celdas vecinas (anillo 1) en los ultimos 7 dias, frecuencia historica de la celda.
- Calendario: dia del anio (seno y coseno).

Los dias sin fuego son la inmensa mayoria, asi que se muestrean (neg_frac) y cada
fila negativa pesa 1/neg_frac. Los positivos se conservan todos. Con esos pesos las
metricas y las probabilidades quedan representativas de la poblacion completa.

Uso:
    python -m pipeline.dataset --start 2012-05-01 --end 2026-08-31
"""
import argparse

import h3
import numpy as np
import pandas as pd

from pipeline import config

HORIZON = 7
WX_COLS = [
    "temp_c", "temp_max_c", "humedad_pct", "viento_kmh", "precip_mm",
    "dias_sin_lluvia", "precip_30d", "precip_90d", "temp_7d", "humedad_7d",
    "vpd_kpa", "temp_anom", "humedad_anom",
]
FIRE_COLS = ["fuego_7d", "fuego_30d", "fuego_90d", "vecinos_7d", "fuego_hist_anual"]
CAL_COLS = ["doy_sin", "doy_cos"]
FEATURES = WX_COLS + FIRE_COLS + CAL_COLS


def _past_sum(a: np.ndarray, w: int) -> np.ndarray:
    """Suma de los dias t-w+1 .. t (incluye t)."""
    c = np.cumsum(a, axis=1, dtype=np.float32)
    out = c.copy()
    out[:, w:] = c[:, w:] - c[:, :-w]
    return out


def _future_sum(a: np.ndarray, h: int) -> np.ndarray:
    """Suma de los dias t+1 .. t+h. NaN donde no hay h dias futuros."""
    c = np.cumsum(a, axis=1, dtype=np.float32)
    n = a.shape[1]
    out = np.full(a.shape, np.nan, dtype=np.float32)
    out[:, : n - h] = c[:, h:] - c[:, : n - h]
    return out


def build(start: str, end: str, horizon: int = HORIZON, neg_frac: float = 0.1, seed: int = 42,
          dia_objetivo: str | list | None = None):
    grid = pd.read_parquet(config.PROCESSED / "grid.parquet")[["h3_cell"]]
    cells = sorted(grid["h3_cell"].tolist())
    cidx = {c: i for i, c in enumerate(cells)}
    n_cells = len(cells)

    days = pd.date_range(start, end)
    n_days = len(days)

    # --- conteo diario de focos por celda
    focos = pd.read_parquet(config.PROCESSED / "focos.parquet")
    focos = focos[focos["confianza_cat"].isin(["nominal", "alta"])].copy()
    focos["fecha"] = pd.to_datetime(focos["fecha_utc"])
    di = (focos["fecha"] - days[0]).dt.days.to_numpy()
    ci = focos["h3_cell"].map(cidx)
    ok = (di >= 0) & (di < n_days) & ci.notna().to_numpy()
    cnt = np.zeros((n_cells, n_days), dtype=np.float32)
    np.add.at(cnt, (ci[ok].astype(int).to_numpy(), di[ok]), 1.0)

    # --- features de fuego
    f7 = _past_sum(cnt, 7)
    f30 = _past_sum(cnt, 30)
    f90 = _past_sum(cnt, 90)

    nbr = np.full((n_cells, 6), -1, dtype=np.int32)
    for c, i in cidx.items():
        vecinos = [v for v in h3.grid_disk(c, 1) if v != c and v in cidx]
        for k, v in enumerate(vecinos[:6]):
            nbr[i, k] = cidx[v]
    nsum = np.zeros_like(f7)
    for k in range(6):
        v = nbr[:, k] >= 0
        nsum[v] += f7[nbr[v, k]]

    cum = np.cumsum(cnt, axis=1, dtype=np.float32)
    hist = np.full_like(cnt, np.nan)
    elapsed = np.arange(1, n_days, dtype=np.float32)
    hist[:, 1:] = cum[:, :-1] / elapsed * 365.25     # focos por anio, solo con pasado

    fut = _future_sum(cnt, horizon)
    y_mat = fut > 0

    # --- clima por punto -> matrices (punto, dia)
    wx = pd.read_parquet(config.PROCESSED / "weather_points.parquet")
    cp = pd.read_parquet(config.PROCESSED / "cell_point.parquet").set_index("h3_cell")["point_id"]
    point_ids = sorted(wx["point_id"].unique())
    pidx = {p: i for i, p in enumerate(point_ids)}
    cell_pidx = np.array([pidx.get(cp.get(c), -1) for c in cells], dtype=np.int32)

    W = {}
    for col in WX_COLS:
        piv = wx.pivot(index="point_id", columns="fecha", values=col)
        piv = piv.reindex(index=point_ids, columns=days)
        W[col] = piv.to_numpy(dtype=np.float32)

    # --- muestreo
    if dia_objetivo is not None:
        # Modo prediccion: todas las celdas de uno o varios dias. y = -1 si aun no se puede evaluar.
        objetivos = [dia_objetivo] if isinstance(dia_objetivo, str) else list(dia_objetivo)
        keep = np.zeros((n_cells, n_days), dtype=bool)
        for d_obj in objetivos:
            t = (pd.Timestamp(d_obj) - days[0]).days
            if not 0 <= t < n_days:
                raise ValueError(f"dia_objetivo {d_obj} fuera de [{start}, {end}]")
            keep[:, t] = True
    else:
        rng = np.random.default_rng(seed)
        valid = ~np.isnan(fut)
        keep = valid & (y_mat | (rng.random((n_cells, n_days)) < neg_frac))
    ri, rj = np.nonzero(keep)

    df = pd.DataFrame({
        "h3_cell": np.array(cells)[ri],
        "fecha": days[rj],
        "y": np.where(np.isnan(fut[ri, rj]), -1, y_mat[ri, rj]).astype(np.int8),
    })
    df["peso"] = np.where(df["y"] == 1, 1.0, 1.0 / neg_frac).astype(np.float32)

    for col in WX_COLS:
        p = cell_pidx[ri]
        vals = np.full(len(ri), np.nan, dtype=np.float32)
        m = p >= 0
        vals[m] = W[col][p[m], rj[m]]
        df[col] = vals
    df["fuego_7d"] = f7[ri, rj]
    df["fuego_30d"] = f30[ri, rj]
    df["fuego_90d"] = f90[ri, rj]
    df["vecinos_7d"] = nsum[ri, rj]
    df["fuego_hist_anual"] = hist[ri, rj]
    doy = days[rj].day_of_year.to_numpy()
    df["doy_sin"] = np.sin(2 * np.pi * doy / 365.25).astype(np.float32)
    df["doy_cos"] = np.cos(2 * np.pi * doy / 365.25).astype(np.float32)
    return df


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2012-05-01")
    ap.add_argument("--end", default="2026-08-31", help="ultimo dia con focos descargados")
    ap.add_argument("--horizon", type=int, default=HORIZON)
    ap.add_argument("--neg-frac", type=float, default=0.1)
    a = ap.parse_args()

    # Guarda de cobertura: no armar el dataset si la descarga de FIRMS esta incompleta.
    fe = pd.to_datetime(pd.read_parquet(config.PROCESSED / "focos.parquet", columns=["fecha_utc"])["fecha_utc"])
    por_anio = fe.dt.year.value_counts().sort_index()
    print("Focos por anio:", {int(k): int(v) for k, v in por_anio.items()})
    faltan = [y for y in range(pd.Timestamp(a.start).year, pd.Timestamp(a.end).year + 1)
              if y not in por_anio.index]
    if faltan:
        raise SystemExit(f"Hay anios sin focos: {faltan}. Completa la descarga de FIRMS y repeti harmonize.")
    if fe.max() < pd.Timestamp(a.end) - pd.Timedelta(days=45):
        raise SystemExit(f"Los focos terminan el {fe.max().date()}, lejos de --end {a.end}. Descarga incompleta.")

    df = build(a.start, a.end, a.horizon, a.neg_frac)
    out = config.PROCESSED / "dataset.parquet"
    df.to_parquet(out, index=False)
    pos = int(df["y"].sum())
    prev = float((df["y"] * df["peso"]).sum() / df["peso"].sum())
    print(f"{len(df)} filas, {pos} positivos. Prevalencia real (ponderada): {prev:.4f}")
    print(f"Guardado en {out}")


if __name__ == "__main__":
    main()
