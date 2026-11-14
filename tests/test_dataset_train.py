import json

import h3
import numpy as np
import pandas as pd

from pipeline import config, dataset, train


def _fake_processed(tmp_path):
    centro = h3.latlng_to_cell(-27.5, -65.8, config.H3_RES)
    cells = sorted(h3.grid_disk(centro, 1))          # 7 celdas
    a = cells[0]
    pd.DataFrame({"h3_cell": cells}).to_parquet(tmp_path / "grid.parquet")

    # un solo foco en la celda `a` el 2024-01-20
    pd.DataFrame({
        "h3_cell": [a], "fecha_utc": [pd.Timestamp("2024-01-20").date()],
        "confianza_cat": ["alta"],
    }).to_parquet(tmp_path / "focos.parquet")

    days = pd.date_range("2024-01-01", "2024-03-01")
    wx = pd.DataFrame({"point_id": "p1", "fecha": days})
    for c in dataset.WX_COLS:
        wx[c] = 1.0
    wx.to_parquet(tmp_path / "weather_points.parquet")
    pd.DataFrame({"h3_cell": cells, "point_id": "p1"}).to_parquet(tmp_path / "cell_point.parquet")
    return cells


def test_etiqueta_y_features_sin_fuga(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "PROCESSED", tmp_path)
    cells = _fake_processed(tmp_path)
    a, b = cells[0], None
    # una celda vecina de `a`
    vecinos = [c for c in h3.grid_disk(a, 1) if c != a and c in cells]
    b = vecinos[0]

    df = dataset.build("2024-01-01", "2024-03-01", horizon=7, neg_frac=1.0)
    da = df[df["h3_cell"] == a].set_index("fecha")
    db = df[df["h3_cell"] == b].set_index("fecha")

    # el foco ocurre el 20/01: y=1 para t = 13/01 .. 19/01 (t+1..t+7 lo contiene)
    pos = da[da["y"] == 1].index
    assert pos.min() == pd.Timestamp("2024-01-13")
    assert pos.max() == pd.Timestamp("2024-01-19")
    assert len(pos) == 7

    # fuego_7d de la celda: 0 antes del foco, 1 del 20 al 26 (solo pasado)
    assert da.loc["2024-01-19", "fuego_7d"] == 0
    assert da.loc["2024-01-20", "fuego_7d"] == 1
    assert da.loc["2024-01-26", "fuego_7d"] == 1
    assert da.loc["2024-01-27", "fuego_7d"] == 0

    # el vecino ve el foco como actividad cercana, pero su propia etiqueta es 0
    assert db.loc["2024-01-22", "vecinos_7d"] == 1
    assert db["y"].sum() == 0

    # la frecuencia historica no puede "ver" el foco antes de que ocurra
    assert da.loc["2024-01-20", "fuego_hist_anual"] == 0
    assert da.loc["2024-01-21", "fuego_hist_anual"] > 0


def test_weighted_quantile():
    v = np.array([1.0, 2.0, 3.0, 4.0])
    w = np.array([1.0, 1.0, 1.0, 1.0])
    assert train.weighted_quantile(v, w, 0.5) in (2.0, 3.0)
    w2 = np.array([1.0, 1.0, 1.0, 100.0])
    assert train.weighted_quantile(v, w2, 0.5) == 4.0


def test_train_corre_de_punta_a_punta(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "PROCESSED", tmp_path)
    monkeypatch.setattr(train, "MODELS", tmp_path / "models")
    (tmp_path / "models").mkdir()

    rng = np.random.default_rng(0)
    n = 6000
    df = pd.DataFrame({c: rng.normal(size=n).astype("float32") for c in dataset.FEATURES})
    df["fecha"] = pd.to_datetime(rng.choice(pd.date_range("2020-01-01", "2025-06-30"), n))
    logit = 1.5 * df["vpd_kpa"] - 3.0
    df["y"] = (rng.random(n) < 1 / (1 + np.exp(-logit))).astype("int8")
    df["peso"] = np.where(df["y"] == 1, 1.0, 10.0).astype("float32")
    df["h3_cell"] = "x"
    df.to_parquet(tmp_path / "dataset.parquet")

    train.main()
    meta = json.loads((tmp_path / "models" / "meta.json").read_text())
    assert set(meta["thresholds"]) == {"medio", "alto", "critico"}
    assert meta["thresholds"]["medio"] <= meta["thresholds"]["alto"] <= meta["thresholds"]["critico"]
    assert (tmp_path / "models" / "argos_xgb.json").exists()
