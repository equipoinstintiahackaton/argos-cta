"""Entrenamiento del modelo de probabilidad de incendio (XGBoost) con validacion temporal.

Corte temporal (nunca aleatorio, para evitar fuga de informacion):
    entrenamiento: antes de 2023-01-01
    validacion:    2023
    prueba:        desde 2024-01-01 en adelante

Niveles de alerta: se definen por percentiles de la probabilidad predicha sobre la
validacion (ponderados): medio >= p80, alto >= p95, critico >= p99. En la prueba se
reporta precision y cobertura (recall) de cada nivel, para poder defender los
umbrales con numeros.

Uso:
    python -m pipeline.train
"""
import json

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import average_precision_score, roc_auc_score

from pipeline import config
from pipeline.dataset import FEATURES

MODELS = config.ROOT / "models"
MODELS.mkdir(exist_ok=True)

TRAIN_END = "2023-01-01"
VALID_END = "2024-01-01"
QUANTILES = {"medio": 0.80, "alto": 0.95, "critico": 0.99}


def weighted_quantile(values: np.ndarray, weights: np.ndarray, q: float) -> float:
    order = np.argsort(values)
    v, w = values[order], weights[order]
    cum = np.cumsum(w) / w.sum()
    return float(v[np.searchsorted(cum, q)])


def level_stats(y, p, w, thresholds):
    base = float((y * w).sum() / w.sum())
    rows = []
    for name, t in thresholds.items():
        sel = p >= t
        tp = float((w * y * sel).sum())
        pred = float((w * sel).sum())
        pos = float((w * y).sum())
        rows.append({
            "nivel": name,
            "umbral": round(t, 5),
            "precision": round(tp / pred, 4) if pred else None,
            "cobertura": round(tp / pos, 4) if pos else None,
            "fraccion_celdas_dia": round(pred / w.sum(), 4),
            "lift": round((tp / pred) / base, 2) if pred and base else None,
        })
    return pd.DataFrame(rows)


def split_temporal(df: pd.DataFrame):
    f = pd.to_datetime(df["fecha"])
    tr = df[f < TRAIN_END]
    va = df[(f >= TRAIN_END) & (f < VALID_END)]
    te = df[f >= VALID_END]
    return tr, va, te


def evaluate(name, y, p, w):
    base = float((y * w).sum() / w.sum())
    ap = average_precision_score(y, p, sample_weight=w)
    auc = roc_auc_score(y, p, sample_weight=w)
    print(f"  {name:<22} PR-AUC={ap:.4f} (base {base:.4f}, x{ap / base:.1f})  ROC-AUC={auc:.3f}")
    return ap


def main():
    df = pd.read_parquet(config.PROCESSED / "dataset.parquet")
    tr, va, te = split_temporal(df)
    print(f"train={len(tr)} valid={len(va)} test={len(te)} filas")
    if min(len(tr), len(va), len(te)) == 0:
        raise SystemExit("Alguno de los cortes temporales quedo vacio. Revisa fechas del dataset.")

    model = xgb.XGBClassifier(
        n_estimators=600, learning_rate=0.05, max_depth=5, min_child_weight=5,
        subsample=0.8, colsample_bytree=0.8, reg_lambda=2.0,
        tree_method="hist", eval_metric="aucpr", early_stopping_rounds=40,
        n_jobs=2, random_state=42,
    )
    model.fit(
        tr[FEATURES], tr["y"], sample_weight=tr["peso"],
        eval_set=[(va[FEATURES], va["y"])], sample_weight_eval_set=[va["peso"]],
        verbose=False,
    )
    print(f"mejor iteracion: {model.best_iteration}")

    p_va = model.predict_proba(va[FEATURES])[:, 1]
    p_te = model.predict_proba(te[FEATURES])[:, 1]

    print("\nPRUEBA (2024 en adelante, datos que el modelo nunca vio):")
    evaluate("modelo XGBoost", te["y"].to_numpy(), p_te, te["peso"].to_numpy())
    evaluate("base: historial celda", te["y"].to_numpy(),
             te["fuego_hist_anual"].fillna(0).to_numpy(), te["peso"].to_numpy())
    evaluate("base: fuego ultimos 7d", te["y"].to_numpy(),
             te["fuego_7d"].to_numpy(), te["peso"].to_numpy())

    thresholds = {
        k: weighted_quantile(p_va, va["peso"].to_numpy(), q) for k, q in QUANTILES.items()
    }
    print("\nNiveles de alerta en PRUEBA:")
    print(level_stats(te["y"].to_numpy(), p_te, te["peso"].to_numpy(), thresholds).to_string(index=False))

    imp = pd.Series(model.get_booster().get_score(importance_type="gain")).sort_values(ascending=False)
    print("\nVariables mas importantes (gain):")
    print(imp.head(10).round(1).to_string())

    model.save_model(MODELS / "argos_xgb.json")
    (MODELS / "meta.json").write_text(json.dumps({
        "features": FEATURES,
        "thresholds": thresholds,
        "quantiles": QUANTILES,
        "best_iteration": int(model.best_iteration),
    }, indent=2))
    print(f"\nModelo guardado en {MODELS}")


if __name__ == "__main__":
    main()
