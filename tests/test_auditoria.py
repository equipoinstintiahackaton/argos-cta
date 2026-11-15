from datetime import date

import numpy as np
import pandas as pd

from pipeline import auditoria


def test_huecos_descarga(tmp_path):
    for n in ["2020-01-01_5d.csv", "2020-01-06_5d.csv", "2020-01-16_5d.csv"]:   # falta del 11 al 15
        (tmp_path / n).write_text("latitude\n")
    assert auditoria.huecos_descarga(tmp_path) == [(date(2020, 1, 11), date(2020, 1, 15))]
    (tmp_path / "2020-01-11_5d.csv").write_text("latitude\n")
    assert auditoria.huecos_descarga(tmp_path) == []


def test_rachas_sin_datos_solo_en_temporada():
    con = pd.date_range("2021-08-01", "2021-08-10").append(pd.date_range("2021-08-25", "2021-08-31"))
    r = auditoria.rachas_sin_datos(con, "2021-08-01", "2021-08-31", min_dias=10)
    assert r == [(date(2021, 8, 11), date(2021, 8, 24), 14)]
    # fuera de temporada no se reclama nada
    assert auditoria.rachas_sin_datos([], "2021-02-01", "2021-02-28") == []


def _focos(n=40):
    ts = pd.date_range("2022-09-01", periods=n, freq="D", tz="UTC")
    return pd.DataFrame({"lat": -27.0 - np.arange(n) * 0.05, "lon": -66.0, "ts_utc": ts,
                         "fecha_utc": ts.date, "instrumento": "VIIRS", "satelite": "N",
                         "brillo_k": 330.0, "frp_mw": 5.0, "confianza_cat": "nominal"})


def test_duplicados_residuales():
    f = _focos(5)
    assert auditoria.duplicados_residuales(f) == (0, 0)
    dup = pd.concat([f, f.iloc[[0]].assign(lat=f.iloc[0]["lat"] + 0.003)], ignore_index=True)  # 330 m, misma hora
    assert auditoria.duplicados_residuales(dup) == (1, 1)
    # 800 m y 2 h: la esfera de union de la deduplicacion NO los une, el cilindro si los cuenta
    lim = pd.concat([f, f.iloc[[0]].assign(lat=f.iloc[0]["lat"] + 0.0072,
                                           ts_utc=f.iloc[0]["ts_utc"] + pd.Timedelta(hours=2))], ignore_index=True)
    assert auditoria.duplicados_residuales(lim) == (0, 1)


def test_contra_firms_sin_salto_de_linea_final(tmp_path, monkeypatch):
    d = tmp_path / "MODIS_SP"
    d.mkdir()
    (d / "2020-01-01_5d.csv").write_text("latitude,longitude\n1,2\n3,4")      # sin \n final, como llega de FIRMS
    from pipeline import ingest_firms
    monkeypatch.setattr(ingest_firms, "fetch_window", lambda *a, **k: "latitude,longitude\n1,2\n3,4")
    assert auditoria.contra_firms(tmp_path, 1)[0]["estado"] == "ok"


def test_campos_detecta_coordenadas_y_valores_imposibles():
    f = _focos(5)
    assert all(c["estado"] == "ok" for c in auditoria.chequeo_campos(f))
    mal = f.copy()
    mal.loc[0, "lat"] = 10.0
    mal.loc[1, "frp_mw"] = -3.0
    est = {c["chequeo"]: c["estado"] for c in auditoria.chequeo_campos(mal)}
    assert est["coordenadas"] == "error" and est["valores imposibles"] == "error"


def test_clima_rangos_y_faltantes():
    dias = pd.date_range("2022-01-01", "2022-04-10")
    c = pd.concat([pd.DataFrame({"point_id": p, "fecha": dias, "temp_c": 20.0, "temp_max_c": 28.0,
                                 "humedad_pct": 50.0, "viento_kmh": 10.0, "precip_mm": 0.0}) for p in ("a", "b")])
    est = {x["chequeo"]: x["estado"] for x in auditoria.chequeo_clima(c, pd.Timestamp("2022-04-12"))}
    assert set(est.values()) == {"ok"}
    c.loc[c.index[:3], "humedad_pct"] = 140.0
    c = c[~((c["point_id"] == "b") & (c["fecha"] < "2022-02-15"))]       # b pierde 45 dias
    est = {x["chequeo"]: x["estado"] for x in auditoria.chequeo_clima(c, pd.Timestamp("2022-04-12"))}
    assert est["clima rangos fisicos"] == "error" and est["clima dias faltantes"] == "aviso"


def test_homogeneidad_viirs_avisa_cambio_de_satelites():
    a = _focos(10).assign(fecha_utc=pd.Timestamp("2017-09-05").date())
    b = pd.concat([_focos(10), _focos(10).assign(satelite="N20")]).assign(fecha_utc=pd.Timestamp("2019-09-05").date())
    focos = pd.concat([a, b], ignore_index=True)
    cob = auditoria.cobertura_focos(focos)
    est = {c["chequeo"]: c["estado"] for c in auditoria.chequeo_cobertura(focos, cob)}
    assert est["homogeneidad VIIRS"] == "aviso"


def test_contra_firms_detecta_diferencias(tmp_path, monkeypatch):
    d = tmp_path / "MODIS_SP"
    d.mkdir()
    (d / "2020-01-01_5d.csv").write_text("latitude,longitude\n1,2\n3,4\n")
    from pipeline import ingest_firms
    monkeypatch.setattr(ingest_firms, "fetch_window", lambda *a, **k: "latitude,longitude\n1,2\n3,4\n")
    assert auditoria.contra_firms(tmp_path, 1)[0]["estado"] == "ok"
    monkeypatch.setattr(ingest_firms, "fetch_window", lambda *a, **k: "latitude,longitude\n1,2\n")
    assert auditoria.contra_firms(tmp_path, 1)[0]["estado"] == "error"


def test_auditar_extremo_a_extremo(tmp_path):
    res = auditoria.auditar(_focos(40), None, tmp_path)
    assert {"checks", "cobertura"} <= set(res)
    assert all(c["estado"] in ("ok", "aviso", "error") for c in res["checks"])


def test_backtest_sintetico_modelo_supera_baselines():
    from pipeline import backtest
    from pipeline.dataset import FEATURES
    rng = np.random.default_rng(0)
    n = 9000
    fechas = pd.to_datetime("2014-01-01") + pd.to_timedelta(rng.integers(0, 365 * 9, n), unit="D")
    df = pd.DataFrame({"h3_cell": rng.choice([f"c{i}" for i in range(30)], n), "fecha": fechas})
    for c in FEATURES:
        df[c] = rng.normal(size=n).astype("float32")
    z = 2.0 * df["vpd_kpa"] - 3.0                      # solo vpd_kpa explica el fuego
    df["y"] = (rng.random(n) < 1 / (1 + np.exp(-z))).astype(int)
    df["peso"] = 1.0
    res = backtest.correr(df, rapido=True, min_pos_test=10, min_pos_train=50)
    assert res["resumen"]["anios_evaluados"] >= 3
    m = res["resumen"]["medias"]
    assert m["modelo"]["pr_auc"] > m["clim_celda_mes"]["pr_auc"] + 0.05
    assert res["resumen"]["anios_modelo_supera_mejor_baseline"] >= 3


def test_metricas_recall_top():
    from pipeline import backtest
    y = np.array([1] * 10 + [0] * 90)
    p = np.r_[np.linspace(0.9, 0.8, 10), np.linspace(0.1, 0.0, 90)]     # perfecto
    m = backtest.metricas(y, p, np.ones(100), con_brier=True)
    assert m["recall_top10"] == 1.0 and m["pr_auc"] > 0.99 and m["brier"] < 0.1


def test_brillo_pocos_valores_es_aviso_y_muchos_error():
    f = _focos(40)
    f.loc[0, "brillo_k"] = 208.0                    # piso real de VIIRS I4
    est = {c["chequeo"]: c["estado"] for c in auditoria.chequeo_campos(f)}
    assert "brillo fuera de rango" not in est       # 208 K cae dentro del rango VIIRS 200 a 400
    f.loc[0, "brillo_k"] = 900.0
    est = {c["chequeo"]: c["estado"] for c in auditoria.chequeo_campos(f)}
    assert est["brillo fuera de rango"] == "error"  # 1 de 40 supera el 0.1%
    grande = _focos(40).loc[[0] * 3000].reset_index(drop=True).assign(
        ts_utc=lambda d: d["ts_utc"] + pd.to_timedelta(np.arange(len(d)), unit="s"))
    grande.loc[0, "brillo_k"] = 900.0
    est = {c["chequeo"]: c["estado"] for c in auditoria.chequeo_campos(grande)}
    assert est["brillo fuera de rango"] == "aviso"  # 1 de 3000 es menos del 0.1%


def test_recall_top_con_empates_no_reclama_todo():
    from pipeline import backtest
    y = np.r_[np.ones(2000), np.zeros(98000)]
    p = np.zeros(100000)                             # baseline que da 0 a todo
    rec, lift = backtest.recall_top(y, p, np.ones(100000), 0.05)
    assert 0.03 < rec < 0.07 and 0.6 < lift < 1.4    # esperado ~5% y lift 1, no 100%
