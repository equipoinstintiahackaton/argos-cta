import numpy as np
import pandas as pd

from pipeline import config, dataset, predict
from tests.test_dataset_train import _fake_processed


def test_asignar_nivel():
    th = {"medio": 0.1, "alto": 0.3, "critico": 0.6}
    p = np.array([0.05, 0.1, 0.29, 0.3, 0.61])
    assert list(predict.asignar_nivel(p, th)) == ["bajo", "medio", "medio", "alto", "critico"]


def test_build_dia_objetivo(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "PROCESSED", tmp_path)
    cells = _fake_processed(tmp_path)
    a = cells[0]

    # El 15/01 el foco del 20/01 cae dentro de los 7 dias siguientes (evaluable)
    df = dataset.build("2024-01-01", "2024-03-01", dia_objetivo="2024-01-15")
    assert len(df) == len(cells)
    assert df.loc[df["h3_cell"] == a, "y"].iloc[0] == 1
    assert (df["y"].drop(df.index[df["h3_cell"] == a]) == 0).all()

    # Cerca del final no hay 7 dias futuros: y = -1 (no evaluable), pero igual hay features
    df2 = dataset.build("2024-01-01", "2024-03-01", dia_objetivo="2024-02-28")
    assert (df2["y"] == -1).all()
    assert df2["temp_c"].notna().all()


def test_explicar_usa_contribuciones_y_no_repite_conceptos():
    valores = pd.Series({"fuego_90d": 3, "fuego_30d": 2, "dias_sin_lluvia": 40.0,
                         "vpd_kpa": 3.1, "doy_sin": 0.5, "doy_cos": 0.5})
    contrib = pd.Series({"fuego_90d": 0.9, "fuego_30d": 0.8, "dias_sin_lluvia": 0.4,
                         "vpd_kpa": 0.01, "doy_sin": 0.3, "doy_cos": 0.2})
    m = predict.explicar(valores, contrib, k=3)
    assert "3 focos en la celda en 90 dias" in m      # el de mayor aporte del grupo
    assert "30 dias" not in m                           # mismo grupo: no se repite
    assert "40 dias sin lluvia" in m
    assert "epoca del anio" in m
    assert "VPD" not in m                               # aporte menor al minimo
    assert predict.explicar(valores, contrib * 0) == "combinacion de condiciones y epoca del anio"


def test_predecir_incluye_motivo(tmp_path, monkeypatch):
    import json

    import xgboost as xgb

    monkeypatch.setattr(config, "PROCESSED", tmp_path)
    cells = _fake_processed(tmp_path)
    rng = np.random.default_rng(0)
    X = pd.DataFrame(rng.normal(size=(500, len(dataset.FEATURES))), columns=dataset.FEATURES)
    y = (X["vpd_kpa"] > 0.5).astype(int)
    modelo = xgb.XGBClassifier(n_estimators=20, max_depth=3).fit(X, y)
    (tmp_path / "models").mkdir()
    modelo.save_model(tmp_path / "models" / "argos_xgb.json")
    (tmp_path / "models" / "meta.json").write_text(json.dumps({
        "features": dataset.FEATURES,
        "thresholds": {"medio": 0.3, "alto": 0.6, "critico": 0.9},
    }))
    monkeypatch.setattr(predict, "MODELS", tmp_path / "models")
    df = predict.predecir("2024-01-15", start="2024-01-01")
    assert len(df) == len(cells)
    assert df["motivo"].map(lambda m: isinstance(m, str) and len(m) > 0).all()
