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
