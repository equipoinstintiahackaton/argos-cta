"""Ablacion: cuanto aporta cada grupo de variables al modelo (evaluado en la prueba).

Uso:
    python -m pipeline.ablacion
"""
import pandas as pd
import xgboost as xgb

from pipeline import config
from pipeline.dataset import FEATURES, WX_COLS
from pipeline.train import evaluate, split_temporal


def _ajustar(tr, va, feats):
    m = xgb.XGBClassifier(
        n_estimators=600, learning_rate=0.05, max_depth=5, min_child_weight=5,
        subsample=0.8, colsample_bytree=0.8, reg_lambda=2.0,
        tree_method="hist", eval_metric="aucpr", early_stopping_rounds=40,
        n_jobs=2, random_state=42,
    )
    m.fit(
        tr[feats], tr["y"], sample_weight=tr["peso"],
        eval_set=[(va[feats], va["y"])], sample_weight_eval_set=[va["peso"]],
        verbose=False,
    )
    return m


def main():
    df = pd.read_parquet(config.PROCESSED / "dataset.parquet")
    tr, va, te = split_temporal(df)
    y, w = te["y"].to_numpy(), te["peso"].to_numpy()
    sin_clima = [f for f in FEATURES if f not in WX_COLS]
    variantes = [
        ("completo (con clima)", FEATURES),
        ("sin clima", sin_clima),
        ("solo epoca + historial", ["doy_sin", "doy_cos", "fuego_hist_anual"]),
    ]
    print("PRUEBA (2024 en adelante). PR-AUC: mas alto es mejor.")
    for nombre, feats in variantes:
        m = _ajustar(tr, va, feats)
        evaluate(nombre, y, m.predict_proba(te[feats])[:, 1], w)


if __name__ == "__main__":
    main()
