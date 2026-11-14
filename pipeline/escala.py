"""Escala de 7 niveles (verde a negro) para ARGOS.

Dos magnitudes distintas, a proposito:

* INDICE de riesgo por celda (0 a 100): reescala monotona de la probabilidad del modelo, anclada
  en percentiles de la VALIDACION (2023). No es una probabilidad: ordena el riesgo relativo.
      p80 -> 20, p90 -> 35, p95 -> 45, p98 -> 60, p99 -> 75, p99.5 -> 80, maximo -> 100
  Los niveles alto y critico anteriores (>= p95) coinciden con indice >= 45.
* PROBABILIDAD por departamento: P(al menos un foco en el departamento en los proximos 7 dias),
  calibrada con datos historicos (ver calibrar_deptos.py). Esta SI es una probabilidad.

Ambas se pintan con los mismos cortes: 20 / 35 / 45 / 60 / 75 / 80.

Uso (una vez, despues de entrenar):
    python -m pipeline.escala
"""
import json

import numpy as np
import pandas as pd
import xgboost as xgb

from pipeline import config

MODELS = config.ROOT / "models"
BANDAS = ["verde", "amarillo", "naranja", "naranja_fuerte", "rojo", "marron", "negro"]
CORTES = [20, 35, 45, 60, 75, 80]                      # limites superiores (exclusivos)
Q_ANCLAS = [0.0, 0.80, 0.90, 0.95, 0.98, 0.99, 0.995, 1.0]
IDX_ANCLAS = [0, 20, 35, 45, 60, 75, 80, 100]
UMBRAL_ALERTA = 45                                      # indice >= 45 (naranja fuerte o mas)


def banda(valor) -> np.ndarray:
    """Nombre de la banda para valores 0-100 (indice o probabilidad en %)."""
    v = np.asarray(valor, dtype=float)
    return np.array(BANDAS, dtype=object)[np.searchsorted(CORTES, v, side="right")]


def estrictamente_creciente(a) -> np.ndarray:
    a = np.maximum.accumulate(np.asarray(a, dtype=float))
    return a + np.arange(len(a)) * 1e-9


def indice(p, p_anclas) -> np.ndarray:
    """Probabilidad del modelo -> indice 0-100 (interpolacion lineal entre anclas)."""
    return np.interp(np.asarray(p, dtype=float), estrictamente_creciente(p_anclas), IDX_ANCLAS)


def cargar(nombre: str):
    f = MODELS / nombre
    return json.loads(f.read_text()) if f.exists() else None


def hazard(p) -> np.ndarray:
    """-log(1-p): suma sobre celdas = -log P(ningun foco) si fueran independientes.
    Se usa en lugar de 1-prod(1-p) para no saturar en 1.0 en departamentos grandes."""
    return -np.log1p(-np.clip(np.asarray(p, dtype=float), 0.0, 0.999999))


def probabilidad_depto(df: pd.DataFrame, celda_depto: pd.DataFrame, calib: dict) -> pd.DataFrame:
    """df: filas (h3_cell, fecha, probabilidad). Devuelve una fila por (fecha, departamento)."""
    d = df[["h3_cell", "fecha", "probabilidad"]].merge(celda_depto, on="h3_cell")
    d["h"] = hazard(d["probabilidad"])
    g = d.groupby(["fecha", "departamento"], as_index=False).agg(h=("h", "sum"), n_celdas=("h3_cell", "size"))
    g["probabilidad"] = np.interp(g["h"], calib["x"], calib["y"])
    g["banda"] = banda(g["probabilidad"] * 100)
    return g.drop(columns="h")


def main():
    from pipeline import train
    from pipeline.dataset import FEATURES

    df = pd.read_parquet(config.PROCESSED / "dataset.parquet")
    _, va, te = train.split_temporal(df)
    model = xgb.XGBClassifier()
    model.load_model(MODELS / "argos_xgb.json")
    p_va = model.predict_proba(va[FEATURES])[:, 1]
    w = va["peso"].to_numpy()
    anclas = [float(p_va.min())] + [train.weighted_quantile(p_va, w, q) for q in Q_ANCLAS[1:-1]] + [float(p_va.max())]
    anclas = [float(x) for x in estrictamente_creciente(anclas)]

    # Que paso realmente en cada banda, en datos que el modelo nunca vio (prueba, 2024 en adelante)
    p_te = model.predict_proba(te[FEATURES])[:, 1]
    wt, yt = te["peso"].to_numpy(), te["y"].to_numpy()
    b = banda(indice(p_te, anclas))
    base = float((yt * wt).sum() / wt.sum())
    filas = []
    for i, nom in enumerate(BANDAS):
        sel = b == nom
        pred = float((wt * sel).sum())
        obs = float((wt * yt * sel).sum() / pred) if pred else None
        filas.append({
            "banda": nom,
            "desde": 0 if i == 0 else CORTES[i - 1],
            "hasta": CORTES[i] if i < len(CORTES) else 100,
            "frac_celdas_dia": round(float(pred / wt.sum()), 4),
            "frecuencia_observada": round(obs, 4) if obs is not None else None,
            "lift": round(obs / base, 1) if obs is not None and base else None,
        })
    tabla = pd.DataFrame(filas)
    print("Que ocurrio realmente en cada banda (PRUEBA, datos nunca vistos):")
    print(f"frecuencia base de fuego en 7 dias por celda: {base:.4f}")
    print(tabla.to_string(index=False))

    (MODELS / "escala.json").write_text(json.dumps({
        "p_anclas": anclas, "q_anclas": Q_ANCLAS, "idx_anclas": IDX_ANCLAS,
        "frecuencia_base": base, "tabla_prueba": filas,
    }, indent=2))
    print(f"Guardado {MODELS / 'escala.json'}")


if __name__ == "__main__":
    main()
