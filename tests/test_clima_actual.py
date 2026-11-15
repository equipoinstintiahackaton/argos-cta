import pandas as pd

from pipeline.clima_actual import COLS, TODA, calcular


def _clima():
    filas = []
    for pid in (1, 2):
        for i, f in enumerate(pd.date_range("2026-11-01", periods=10)):
            fila = {"point_id": pid, "fecha": f, **{c: float(pid * 10 + i) for c in COLS}}
            if i >= 8:
                fila["temp_c"] = None
            filas.append(fila)
    return pd.DataFrame(filas)


def test_promedia_por_depto_y_agrega_provincia():
    cp = pd.DataFrame({"h3_cell": ["a", "b"], "point_id": [1, 2]})
    cd = pd.DataFrame({"h3_cell": ["a", "b"], "departamento": ["X", "Y"]})
    out = calcular(_clima(), cp, cd, dias=3)
    assert set(out["departamento"]) == {"X", "Y", TODA}
    assert out["fecha"].nunique() == 3
    # ultimos 3 dias con temperatura valida: indices 5,6,7 (8 y 9 son nulos)
    assert str(out["fecha"].max()) == "2026-11-08"
    prov = out[(out["departamento"] == TODA) & (out["fecha"].astype(str) == "2026-11-08")]["temp_c"].iloc[0]
    assert prov == (17 + 27) / 2
