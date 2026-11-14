"""Calibracion de la probabilidad por departamento.

Pregunta: P(al menos un foco en el departamento en los proximos 7 dias).
Se combina la probabilidad de cada celda en un puntaje (suma de -log(1-p)) y se lo traduce a
probabilidad real con regresion isotonica ajustada en la VALIDACION (2023) contra lo que
paso de verdad. Luego se mide la confiabilidad en la PRUEBA (2024 en adelante): para cada
banda, cuanto prometia el sistema y cuanto ocurrio.

Uso:
    python -m pipeline.calibrar_deptos
"""
import json

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression

from pipeline import config, dataset, escala

MODELS = config.ROOT / "models"
PASO_DIAS = 2


def agregar(df: pd.DataFrame, celda_depto: pd.DataFrame) -> pd.DataFrame:
    """df: h3_cell, fecha, y, probabilidad (solo filas evaluables). Una fila por (fecha, depto)."""
    d = df.merge(celda_depto, on="h3_cell")
    d["h"] = escala.hazard(d["probabilidad"])
    return d.groupby(["fecha", "departamento"], as_index=False).agg(
        h=("h", "sum"), y=("y", "max"), n_celdas=("h3_cell", "size"))


def ajustar(g: pd.DataFrame) -> IsotonicRegression:
    iso = IsotonicRegression(y_min=0.0, y_max=1.0, increasing=True, out_of_bounds="clip")
    iso.fit(g["h"], g["y"])
    return iso


def calib_isotonica(g: pd.DataFrame) -> dict:
    iso = ajustar(g)
    return {"x": [float(x) for x in iso.X_thresholds_], "y": [float(y) for y in iso.y_thresholds_]}


def calib_logistica(g: pd.DataFrame, h_max: float) -> dict:
    """Curva suave: P = sigmoide(a + b * log(1 + h)). No hace escalones ni llega a 100%."""
    lr = LogisticRegression(C=100.0, max_iter=1000).fit(np.log1p(g[["h"]].to_numpy()), g["y"])
    x = np.linspace(0.0, max(h_max * 2.0, 1.0), 800)
    y = lr.predict_proba(np.log1p(x.reshape(-1, 1)))[:, 1]
    return {"x": [float(v) for v in x], "y": [float(v) for v in y]}


def perdida(g: pd.DataFrame, calib: dict) -> dict:
    p = np.clip(np.interp(g["h"], calib["x"], calib["y"]), 1e-4, 1 - 1e-4)
    y = g["y"].to_numpy()
    return {"brier": float(np.mean((p - y) ** 2)),
            "logloss": float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))}


def elegir(va: pd.DataFrame, te: pd.DataFrame, h_max: float):
    """Ajusta ambos metodos en validacion y se queda con el de menor logloss en prueba."""
    cands = {"isotonica": calib_isotonica(va), "logistica": calib_logistica(va, h_max)}
    res = {k: perdida(te, c) for k, c in cands.items()}
    mejor = min(res, key=lambda k: res[k]["logloss"])
    return cands[mejor], mejor, res


def confiabilidad(g: pd.DataFrame, calib: dict) -> pd.DataFrame:
    g = g.copy()
    g["p"] = np.interp(g["h"], calib["x"], calib["y"])
    g["banda"] = escala.banda(g["p"] * 100)
    filas = []
    for nom in escala.BANDAS:
        s = g[g["banda"] == nom]
        filas.append({"banda": nom, "n": int(len(s)),
                      "prometido": round(float(s["p"].mean()), 3) if len(s) else None,
                      "observado": round(float(s["y"].mean()), 3) if len(s) else None})
    return pd.DataFrame(filas)


def main():
    meta = json.loads((MODELS / "meta.json").read_text())
    model = xgb.XGBClassifier()
    model.load_model(MODELS / "argos_xgb.json")
    cd = pd.read_parquet(config.PROCESSED / "celda_depto.parquet")

    f = pd.to_datetime(pd.read_parquet(config.PROCESSED / "focos.parquet", columns=["fecha_utc"])["fecha_utc"])
    fin = f.max()
    dias = [d.strftime("%Y-%m-%d") for d in pd.date_range("2023-01-01", fin, freq=f"{PASO_DIAS}D")]
    print(f"Calculando {len(dias)} fechas x {len(cd)} celdas ...")
    df = dataset.build("2012-05-01", fin.strftime("%Y-%m-%d"), dia_objetivo=dias)
    df = df[df["y"] >= 0].copy()                                   # solo fechas evaluables
    df["probabilidad"] = model.predict_proba(df[meta["features"]])[:, 1]

    g = agregar(df, cd)
    va = g[g["fecha"] < "2024-01-01"]
    te = g[g["fecha"] >= "2024-01-01"]
    if len(va) < 200 or len(te) < 200 or va["y"].sum() < 20:
        raise SystemExit("Pocos datos para calibrar a nivel departamento.")
    calib, metodo, res = elegir(va, te, float(g["h"].max()))
    print("\nError en PRUEBA por metodo (menor es mejor):")
    for k, v in res.items():
        print(f"  {k:<10} brier={v['brier']:.4f}  logloss={v['logloss']:.4f}")
    print(f"Metodo elegido: {metodo}")

    print(f"\nfrecuencia de fuego por departamento-semana: validacion {va['y'].mean():.3f}, prueba {te['y'].mean():.3f}")
    tabla = confiabilidad(te, calib)
    print("\nCONFIABILIDAD EN PRUEBA (2024 en adelante): prometido vs observado")
    print(tabla.to_string(index=False))

    (MODELS / "calib_deptos.json").write_text(json.dumps({**calib, "metodo": metodo, "confiabilidad_prueba": tabla.to_dict("records")}, indent=2))
    print(f"Guardado {MODELS / 'calib_deptos.json'}")


if __name__ == "__main__":
    main()
