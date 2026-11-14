import numpy as np
import pandas as pd

from pipeline import weather


def test_snap_a_grilla_power():
    plat, plon = weather.snap(-27.3, -65.7)
    assert float(plat) == -27.5
    assert abs(float(plon) - (-65.625)) < 1e-9


def test_parse_power_reemplaza_faltantes_y_convierte_viento():
    js = {"properties": {"parameter": {
        "T2M": {"20240101": 25.0, "20240102": -999},
        "T2M_MAX": {"20240101": 32.0, "20240102": 31.0},
        "RH2M": {"20240101": 40.0, "20240102": 45.0},
        "PRECTOTCORR": {"20240101": 0.0, "20240102": 3.0},
        "WS2M": {"20240101": 5.0, "20240102": 2.0},
    }}}
    df = weather.parse_power(js)
    assert len(df) == 2
    assert np.isnan(df.loc[1, "temp_c"])
    assert abs(df.loc[0, "viento_kmh"] - 18.0) < 1e-9


def _serie(precip):
    n = len(precip)
    return pd.DataFrame({
        "fecha": pd.date_range("2024-01-01", periods=n),
        "temp_c": [30.0] * n, "temp_max_c": [35.0] * n,
        "humedad_pct": [50.0] * n, "precip_mm": precip, "viento_kmh": [10.0] * n,
    })


def test_dias_sin_lluvia():
    d = weather.derive(_serie([5, 0, 0, 0, 2, 0]))
    assert list(d["dias_sin_lluvia"]) == [0, 1, 2, 3, 0, 1]


def test_vpd_razonable():
    d = weather.derive(_serie([0, 0, 0]))
    # T=30C, HR=50% -> es ~4.24 kPa, VPD ~2.12 kPa
    assert abs(d["vpd_kpa"].iloc[0] - 2.12) < 0.05
