import numpy as np
import pandas as pd

from pipeline import incendios


def _f(lat, lon, ts, cel="a", conf="nominal", frp=5.0, inst="VIIRS"):
    return {"lat": lat, "lon": lon, "ts_utc": pd.Timestamp(ts, tz="UTC"), "h3_cell": cel,
            "confianza_cat": conf, "frp_mw": frp, "frp_total_mw": frp, "instrumento": inst}


CD = pd.DataFrame({"h3_cell": ["a", "b"], "departamento": ["Capayan", "Ambato"]})


def test_un_incendio_de_varios_dias_es_un_evento_con_duracion():
    filas = [_f(-27.0, -66.0, "2024-08-01 18:00"), _f(-27.005, -66.0, "2024-08-01 21:00"),
             _f(-27.01, -66.005, "2024-08-02 18:30"), _f(-27.01, -66.0, "2024-08-03 18:00")]
    ev = incendios.construir(pd.DataFrame(filas), CD)
    assert len(ev) == 1
    e = ev.iloc[0]
    assert e["n_focos"] == 4 and e["dias_activos"] == 3 and e["departamento"] == "Capayan"
    assert abs(e["duracion_h"] - 48.0) < 0.1


def test_mismo_lugar_en_dias_distintos_son_incendios_distintos():
    """Regresion del error de unidades de tiempo: separacion de 9 dias no debe unirse."""
    filas = [_f(-27.0, -66.0, "2024-08-01 18:00"), _f(-27.0, -66.0, "2024-08-10 18:00")]
    ev = incendios.construir(pd.DataFrame(filas), CD)
    assert len(ev) == 2 and (ev["duracion_h"] == 0).all()


def test_lejos_en_el_espacio_o_confianza_baja():
    filas = [_f(-27.0, -66.0, "2024-08-01 18:00"), _f(-27.2, -66.0, "2024-08-01 18:00", cel="b"),
             _f(-27.0, -66.0, "2024-08-01 19:00", conf="baja")]
    ev = incendios.construir(pd.DataFrame(filas), CD)
    assert len(ev) == 2 and int(ev["n_focos"].sum()) == 2       # el de confianza baja no cuenta


def test_tamano_y_prolongado():
    assert incendios.tamano(1, 1) == "puntual" and incendios.tamano(1, 3) == "pequeno"
    assert incendios.tamano(2, 5) == "mediano" and incendios.tamano(5, 50) == "grande"
    dias = pd.date_range("2024-08-01", periods=20, freq="D")
    ev = incendios.construir(pd.DataFrame([_f(-27.0, -66.0, d) for d in dias]), CD)
    assert len(ev) == 1 and bool(ev.iloc[0]["prolongado"])
