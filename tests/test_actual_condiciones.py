from datetime import date

import numpy as np
import pandas as pd

from pipeline import actualizar, condiciones, config, predict, weather


def test_ultimo_dia_y_limpieza(tmp_path):
    for nombre in ["2026-08-27_5d.csv", "2026-09-01_5d.csv", "2026-09-06_3d.csv", "otro.txt"]:
        (tmp_path / nombre).write_text("x")
    assert actualizar.ultimo_dia(tmp_path) == date(2026, 9, 8)
    borradas = actualizar.limpiar_recientes(tmp_path, date(2026, 9, 5))   # ventanas que llegan al 5/09 o despues
    assert borradas == 2
    assert actualizar.ultimo_dia(tmp_path) == date(2026, 8, 31)
    assert (tmp_path / "otro.txt").exists()


def test_ultima_fecha_es_la_menor_de_focos_y_clima(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "PROCESSED", tmp_path)
    pd.DataFrame({"fecha_utc": pd.to_datetime(["2026-11-10", "2026-11-13"]).date}).to_parquet(tmp_path / "focos.parquet")
    pd.DataFrame({"fecha": pd.to_datetime(["2026-11-09", "2026-11-10", "2026-11-11"]),
                  "temp_c": [20.0, 21.0, np.nan]}).to_parquet(tmp_path / "weather_points.parquet")
    assert predict.ultima_fecha() == "2026-11-10"      # el clima valido llega hasta el 10


def test_clima_incremental_agrega_solo_dias_nuevos(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "PROCESSED", tmp_path)
    raw = tmp_path / "power"
    raw.mkdir()
    monkeypatch.setattr(weather, "RAW_POWER", raw)
    monkeypatch.setattr(weather.time, "sleep", lambda s: None)
    pd.DataFrame({"h3_cell": ["a"], "lat": [-27.5], "lon": [-65.8]}).to_parquet(tmp_path / "grid.parquet")

    cols = ["temp_c", "temp_max_c", "humedad_pct", "viento_kmh", "precip_mm"]

    def serie(dias):
        d = pd.DataFrame({"fecha": pd.to_datetime(dias)})
        for c in cols:
            d[c] = 1.0
        return d

    llamadas = []

    def falso(plat, plon, ini, fin, retries=4):
        llamadas.append((ini, fin))
        d = serie(pd.date_range(ini, fin))
        d.loc[d["fecha"] > "2024-01-12", cols] = np.nan      # POWER todavia no publico esos dias
        return d

    monkeypatch.setattr(weather, "fetch_point", falso)
    weather.run(date(2024, 1, 1), date(2024, 1, 10))
    weather.run(date(2024, 1, 1), date(2024, 1, 15), incremental=True)
    assert llamadas[-1][0] == date(2024, 1, 11)            # pidio solo desde el dia siguiente
    wx = pd.read_parquet(tmp_path / "weather_points.parquet")
    assert wx["fecha"].max() == pd.Timestamp("2024-01-12")  # los dias sin dato no se guardan


def test_condiciones_compara_con_base_del_mismo_mes():
    rng = np.random.default_rng(0)
    dias = pd.date_range("2020-01-01", "2022-12-31")
    clima = pd.DataFrame({"point_id": "p1", "fecha": dias})
    for v in condiciones.VARIABLES:
        clima[v] = rng.normal(20, 2, len(dias))
    fuego = dias[(dias.month == 9) & (dias.day % 6 == 0)]
    clima.loc[clima["fecha"].isin(fuego), "humedad_pct"] -= 15       # los dias con fuego son mas secos
    focos = pd.DataFrame({"h3_cell": "a", "fecha_utc": fuego.date})
    cp = pd.DataFrame({"h3_cell": ["a"], "point_id": ["p1"]})
    t = condiciones.calcular(focos, cp, clima).set_index(["variable", "grupo"])
    assert t.loc[("humedad_pct", "base"), "p50"] - t.loc[("humedad_pct", "foco"), "p50"] > 10
    assert abs(t.loc[("viento_kmh", "base"), "p50"] - t.loc[("viento_kmh", "foco"), "p50"]) < 2
    assert t.loc[("humedad_pct", "foco"), "n"] == len(fuego)
