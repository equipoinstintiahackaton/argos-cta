import json

import geopandas as gpd
import numpy as np
import pandas as pd
import xgboost as xgb
from shapely.geometry import Point, box

from pipeline import calibrar_deptos, config, dataset, departamentos, escala, estadisticas, predict
from tests.test_dataset_train import _fake_processed


def test_banda_cortes():
    v = [0, 19.9, 20, 34.9, 35, 44.9, 45, 59.9, 60, 74.9, 75, 79.9, 80, 100]
    esperado = ["verde", "verde", "amarillo", "amarillo", "naranja", "naranja", "naranja_fuerte",
                "naranja_fuerte", "rojo", "rojo", "marron", "marron", "negro", "negro"]
    assert list(escala.banda(v)) == esperado


def test_indice_monotono_y_anclado():
    anclas = [0.0, 0.01, 0.02, 0.03, 0.05, 0.07, 0.08, 0.1]
    assert np.allclose(escala.indice(anclas, anclas), escala.IDX_ANCLAS, atol=1e-3)
    p = np.linspace(0, 0.2, 200)
    i = escala.indice(p, anclas)
    assert (np.diff(i) >= 0).all() and i.max() == 100          # fuera de rango: se satura
    # anclas repetidas (probabilidades iguales) no rompen la interpolacion
    assert np.isfinite(escala.indice([0.01], [0.0, 0.0, 0.0, 0.01, 0.01, 0.02, 0.03, 0.04])).all()


def test_hazard_no_satura():
    assert escala.hazard(np.array([0.0, 0.5]))[1] > escala.hazard(np.array([0.1]))[0]
    assert np.isfinite(escala.hazard(np.array([1.0]))).all()


def test_asignar_celdas_a_departamentos_con_borde():
    deptos = gpd.GeoDataFrame({"nombre": ["Norte", "Sur"]},
                              geometry=[box(0, 1, 2, 2), box(0, 0, 2, 1)], crs=4326)
    celdas = gpd.GeoDataFrame({"h3_cell": ["a", "b", "c"]},
                              geometry=[Point(1, 1.5), Point(1, 0.5), Point(1, 2.2)], crs=4326)
    r = departamentos.asignar(celdas, deptos).set_index("h3_cell")["departamento"]
    assert r["a"] == "Norte" and r["b"] == "Sur"
    assert r["c"] == "Norte"                  # fuera de todo poligono: el mas cercano


def _fake_agregado(n=600, seed=0):
    rng = np.random.default_rng(seed)
    h = rng.gamma(2.0, 1.0, n)
    y = (rng.random(n) < 1 - np.exp(-0.5 * h)).astype(int)
    return pd.DataFrame({"h": h, "y": y})


def test_calibracion_isotonica_es_monotona_y_confiable():
    g = _fake_agregado(4000)
    iso = calibrar_deptos.ajustar(g)
    calib = {"x": [float(x) for x in iso.X_thresholds_], "y": [float(y) for y in iso.y_thresholds_]}
    p = np.interp(np.linspace(0, 10, 50), calib["x"], calib["y"])
    assert (np.diff(p) >= 0).all() and 0 <= p.min() and p.max() <= 1
    t = calibrar_deptos.confiabilidad(_fake_agregado(4000, seed=1), calib)
    ok = t.dropna(subset=["n"])
    ok = ok[ok["n"] > 100]
    assert len(ok) >= 2
    assert (abs(ok["prometido"] - ok["observado"]) < 0.08).all()   # prometido ~ observado


def test_estadisticas_y_ranking():
    cd = pd.DataFrame({"h3_cell": ["a", "b", "c"], "departamento": ["Norte", "Norte", "Sur"]})
    focos = pd.DataFrame({
        "h3_cell": ["a", "a", "b", "c", "c", "c"],
        "fecha_utc": pd.to_datetime(["2024-08-01", "2024-08-02", "2024-08-03",
                                     "2024-08-04", "2024-08-05", "2024-09-01"]).date,
        "hora_local": [14, 15, 2, 14, 14, 20],
        "confianza_cat": ["alta", "baja", "nominal", "alta", "alta", "alta"],
        "frp_total_mw": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
    })
    t = estadisticas.calcular(focos, cd)
    m = t["mensual"].set_index(["anio", "mes", "departamento"])
    assert m.loc[(2024, 8, "Norte"), "focos"] == 3 and m.loc[(2024, 8, "Norte"), "focos_confiables"] == 2
    assert m.loc[(2024, 8, "Sur"), "focos"] == 2
    r = t["ranking"].set_index(["anio", "mes", "departamento"])
    assert r.loc[(2024, 8, "Norte"), "puesto"] == 1 and r.loc[(2024, 8, "Sur"), "puesto"] == 2
    assert pd.isna(r.loc[(2024, 9, "Norte"), "puesto"]) and r.loc[(2024, 9, "Sur"), "puesto"] == 1
    assert t["hora"].set_index(["departamento", "hora_local"]).loc[("Sur", 14), "focos"] == 2


def test_build_varios_dias_objetivo(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "PROCESSED", tmp_path)
    cells = _fake_processed(tmp_path)
    df = dataset.build("2024-01-01", "2024-03-01", dia_objetivo=["2024-01-15", "2024-01-17"])
    assert len(df) == 2 * len(cells)
    assert set(df["fecha"].dt.strftime("%Y-%m-%d")) == {"2024-01-15", "2024-01-17"}


def test_predecir_agrega_indice_y_banda(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "PROCESSED", tmp_path)
    cells = _fake_processed(tmp_path)
    rng = np.random.default_rng(0)
    X = pd.DataFrame(rng.normal(size=(500, len(dataset.FEATURES))), columns=dataset.FEATURES)
    y = (X["vpd_kpa"] > 0.5).astype(int)
    modelo = xgb.XGBClassifier(n_estimators=20, max_depth=3).fit(X, y)
    mdir = tmp_path / "models"
    mdir.mkdir()
    modelo.save_model(mdir / "argos_xgb.json")
    (mdir / "meta.json").write_text(json.dumps({
        "features": dataset.FEATURES, "thresholds": {"medio": 0.3, "alto": 0.6, "critico": 0.9}}))
    (mdir / "escala.json").write_text(json.dumps({"p_anclas": [0.0, 0.1, 0.2, 0.3, 0.5, 0.7, 0.8, 1.0]}))
    monkeypatch.setattr(predict, "MODELS", mdir)
    monkeypatch.setattr(escala, "MODELS", mdir)
    df = predict.predecir("2024-01-15", start="2024-01-01")
    assert len(df) == len(cells)
    assert df["indice"].between(0, 100).all()
    assert set(df["banda"]).issubset(set(escala.BANDAS))
