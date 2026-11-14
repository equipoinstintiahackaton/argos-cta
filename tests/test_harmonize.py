import pandas as pd

from pipeline import harmonize


def _modis():
    return pd.DataFrame({
        "latitude": [-28.00, -27.50],
        "longitude": [-65.50, -66.00],
        "brightness": [330.0, 310.0],
        "scan": [1.0, 1.0], "track": [1.0, 1.0],
        "acq_date": ["2024-09-10", "2024-09-10"],
        "acq_time": ["1830", "1830"],
        "satellite": ["Terra", "Terra"],
        "instrument": ["MODIS", "MODIS"],
        "confidence": [85, 20],
        "version": ["6.1NRT"] * 2,
        "bright_t31": [300.0, 295.0],
        "frp": [12.0, 3.0],
        "daynight": ["D", "D"],
    })


def _viirs():
    return pd.DataFrame({
        # primer punto: ~300 m del primer foco MODIS, 20 min despues (mismo evento)
        "latitude": [-28.0025, -26.00],
        "longitude": [-65.5010, -65.00],
        "bright_ti4": [340.0, 320.0],
        "scan": [0.4, 0.4], "track": [0.4, 0.4],
        "acq_date": ["2024-09-10", "2024-09-11"],
        "acq_time": ["1850", "0200"],
        "satellite": ["N", "N"],
        "instrument": ["VIIRS", "VIIRS"],
        "confidence": ["h", "l"],
        "version": ["2.0NRT"] * 2,
        "bright_ti5": [295.0, 290.0],
        "frp": [10.0, 1.0],
        "daynight": ["D", "N"],
    })


def test_normalize_confianza_y_resolucion():
    m = harmonize.normalize(_modis(), "MODIS")
    v = harmonize.normalize(_viirs(), "VIIRS")
    assert list(m["confianza_cat"]) == ["alta", "baja"]
    assert list(v["confianza_cat"]) == ["alta", "baja"]
    assert set(m["res_m"]) == {1000}
    assert set(v["res_m"]) == {375}
    assert m["ts_utc"].iloc[0].hour == 18 and m["ts_utc"].iloc[0].minute == 30


def test_deduplicacion_une_mismo_evento_y_conserva_viirs():
    m = harmonize.normalize(_modis(), "MODIS")
    v = harmonize.normalize(_viirs(), "VIIRS")
    todo = pd.concat([m, v], ignore_index=True)
    assert len(todo) == 4
    dedup = harmonize.deduplicate(todo)
    # 4 detecciones -> 3 eventos (MODIS#1 y VIIRS#1 son el mismo)
    assert len(dedup) == 3
    fusionado = dedup[dedup["n_detecciones"] == 2].iloc[0]
    assert fusionado["instrumento"] == "VIIRS"      # se queda con mayor resolucion
    assert fusionado["fuentes"] == "MODIS+VIIRS"
    assert fusionado["frp_total_mw"] == 10.0   # solo VIIRS, sin doble conteo con MODIS
    assert fusionado["n_pixeles"] == 1


def test_finalize_columnas_y_h3():
    m = harmonize.normalize(_modis(), "MODIS")
    final = harmonize.finalize(harmonize.deduplicate(m))
    assert list(final.columns) == harmonize.COLUMNAS_FINALES
    assert final["h3_cell"].str.len().min() > 0
    assert final["foco_id"].is_unique


def test_solo_vegetacion_y_fuentes_fijas():
    import numpy as np

    from pipeline import harmonize

    # tipo: 0 vegetacion, 1 volcan, NaN (sin dato) se conserva
    d = pd.DataFrame({"tipo": [0, 1, np.nan, 2]})
    assert list(harmonize.solo_vegetacion(d)["tipo"].fillna(-1)) == [0.0, -1.0]

    # fuente fija: 150 dias distintos en ~4 anios sobre el mismo bloque + 3 focos sueltos
    dias = pd.date_range("2018-01-01", periods=1500, freq="D", tz="UTC")[::10]
    fija = pd.DataFrame({"lat": -26.50 + np.linspace(0, 0.004, len(dias)),
                         "lon": -67.00, "ts_utc": dias})
    sueltos = pd.DataFrame({
        "lat": [-27.0, -27.5, -28.0], "lon": [-65.0, -65.5, -66.0],
        "ts_utc": pd.to_datetime(["2024-09-01 12:00"] * 3, utc=True),
    })
    todo = pd.concat([fija, sueltos], ignore_index=True)
    filtrado, fijas = harmonize.quitar_fuentes_fijas(todo)
    assert len(fijas) == 1
    assert len(filtrado) == 3
