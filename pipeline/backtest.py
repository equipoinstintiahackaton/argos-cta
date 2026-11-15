"""Backtesting por anio del modelo de probabilidad contra baselines simples.

Una sola particion temporal puede dar un resultado bueno o malo por suerte. Aca se repite
el ejercicio de prevencion para cada anio Y: se entrena con todo lo anterior a Y-1, se usa
Y-1 para frenar el entrenamiento (early stopping) y se evalua en Y, que el modelo nunca vio.

Baselines (lo que se obtendria SIN machine learning):
  - clim_celda_mes: frecuencia historica de focos de esa celda en ese mes del anio (solo con datos de entrenamiento)
  - historial_celda: focos por anio acumulados en la celda
  - fuego_7d: focos en la celda en los ultimos 7 dias

Metricas (ponderadas por el peso de muestreo, asi representan toda la poblacion celda-dia):
  - PR-AUC y ROC-AUC
  - Brier (solo para quien emite probabilidades: modelo y clim_celda_mes)
  - recall_top5 / recall_top10: que fraccion de los casos con foco caen dentro del 5% / 10% de
    celda-dias con mayor puntaje. Es la metrica operativa: "si solo se pudiera vigilar el 5%
    de la provincia, cuantos incendios se habrian cubierto".
  - lift_top5: cuantas veces mas probable es un foco dentro de ese 5% que en promedio.

Uso:
    python -m pipeline.backtest
    python -m pipeline.backtest --rapido
"""
import argparse
import json

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import average_precision_score, roc_auc_score

from pipeline import config
from pipeline.dataset import FEATURES
from pipeline.train import MODELS

MODELOS = ["modelo", "clim_celda_mes", "historial_celda", "fuego_7d"]


def recall_top(y, p, w, frac, seed=0):
    """Recall y lift dentro del `frac` de celda-dias (por peso) con mayor puntaje.

    Los empates se rompen al azar: un baseline que da 0 a casi todas las celdas NO puede
    reclamar 100% de recall por "seleccionar todo". Con puntaje constante el recall esperado es `frac`.
    """
    y, p, w = np.asarray(y), np.asarray(p, dtype=float), np.asarray(w, dtype=float)
    orden = np.lexsort((np.random.default_rng(seed).random(len(p)), -p))
    sel = orden[np.cumsum(w[orden]) / w.sum() <= frac]
    pos, base = float((w * y).sum()), float((w * y).sum() / w.sum())
    tp, pred = float((w[sel] * y[sel]).sum()), float(w[sel].sum())
    return (tp / pos if pos else None), ((tp / pred) / base if pred and base else None)


def metricas(y, p, w, con_brier=False) -> dict:
    y = np.asarray(y)
    p = np.asarray(p, dtype=float)
    w = np.asarray(w, dtype=float)
    base = float((y * w).sum() / w.sum())
    out = {"tasa_base": base,
           "pr_auc": float(average_precision_score(y, p, sample_weight=w)),
           "roc_auc": float(roc_auc_score(y, p, sample_weight=w)),
           "brier": float((w * (p - y) ** 2).sum() / w.sum()) if con_brier else None}
    for k, frac in (("top5", 0.05), ("top10", 0.10)):
        rec, lift = recall_top(y, p, w, frac)
        out[f"recall_{k}"] = rec
        if k == "top5":
            out["lift_top5"] = lift
    return out


def clim_celda_mes(tr: pd.DataFrame, te: pd.DataFrame, prior: float = 30.0) -> np.ndarray:
    """Probabilidad = frecuencia ponderada de foco por (celda, mes) en entrenamiento, suavizada."""
    g = float((tr["y"] * tr["peso"]).sum() / tr["peso"].sum())
    a = tr.assign(mes=pd.to_datetime(tr["fecha"]).dt.month, wy=tr["y"] * tr["peso"])
    s = a.groupby(["h3_cell", "mes"]).agg(wy=("wy", "sum"), w=("peso", "sum"))
    s["p"] = (s["wy"] + prior * g) / (s["w"] + prior)
    idx = pd.MultiIndex.from_arrays([te["h3_cell"], pd.to_datetime(te["fecha"]).dt.month])
    return s["p"].reindex(idx).fillna(g).to_numpy()


def entrenar(tr, va, rapido=False):
    m = xgb.XGBClassifier(
        n_estimators=150 if rapido else 400, learning_rate=0.15 if rapido else 0.06,
        max_depth=5, min_child_weight=5, subsample=0.8, colsample_bytree=0.8, reg_lambda=2.0,
        tree_method="hist", eval_metric="aucpr", early_stopping_rounds=30, n_jobs=2, random_state=42)
    m.fit(tr[FEATURES], tr["y"], sample_weight=tr["peso"],
          eval_set=[(va[FEATURES], va["y"])], sample_weight_eval_set=[va["peso"]], verbose=False)
    return m


def correr(df: pd.DataFrame, rapido=False, min_pos_test=30, min_pos_train=200, primer_anio=None) -> dict:
    df = df[df["y"] >= 0].copy()
    df["anio"] = pd.to_datetime(df["fecha"]).dt.year
    anios = sorted(df["anio"].unique())
    desde = primer_anio or anios[0] + 4          # al menos 3 anios de entrenamiento y 1 de freno
    filas, omitidos = [], []
    for Y in [a for a in anios if a >= desde]:
        tr, va, te = df[df["anio"] < Y - 1], df[df["anio"] == Y - 1], df[df["anio"] == Y]
        npos = {"entrenamiento": int(tr["y"].sum()), "freno": int(va["y"].sum()), "prueba": int(te["y"].sum())}
        if npos["prueba"] < min_pos_test or npos["entrenamiento"] < min_pos_train or npos["freno"] < 10:
            omitidos.append({"anio": int(Y), "positivos": npos})
            print(f"  {Y}: omitido por pocos positivos {npos}")
            continue
        model = entrenar(tr, va, rapido)
        y, w = te["y"].to_numpy(), te["peso"].to_numpy()
        puntajes = {
            "modelo": (model.predict_proba(te[FEATURES])[:, 1], True),
            "clim_celda_mes": (clim_celda_mes(tr, te), True),
            "historial_celda": (te["fuego_hist_anual"].fillna(0).to_numpy(), False),
            "fuego_7d": (te["fuego_7d"].to_numpy(), False),
        }
        linea = []
        for nombre, (p, brier) in puntajes.items():
            m = metricas(y, p, w, con_brier=brier)
            filas.append({"anio": int(Y), "modelo": nombre, "positivos": npos["prueba"], **m})
            linea.append(f"{nombre} {m['pr_auc']:.3f}/{m['recall_top5']:.2f}")
        print(f"  {Y}: PR-AUC/recall@5%  " + "  ".join(linea))
    res = pd.DataFrame(filas)
    return {"filas": filas, "omitidos": omitidos, "resumen": resumir(res)}


def resumir(res: pd.DataFrame) -> dict:
    if res.empty:
        return {}
    med = res.groupby("modelo")[["pr_auc", "roc_auc", "recall_top5", "recall_top10", "lift_top5"]].mean()
    piv = res.pivot(index="anio", columns="modelo", values="pr_auc")
    mejor_base = piv[[c for c in piv.columns if c != "modelo"]].max(axis=1)
    gana = int((piv["modelo"] > mejor_base).sum())
    return {"anios_evaluados": int(len(piv)), "anios_modelo_supera_mejor_baseline": gana,
            "medias": {k: {c: round(float(v), 4) for c, v in r.items()} for k, r in med.iterrows()}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rapido", action="store_true", help="menos arboles, para probar")
    a = ap.parse_args()
    df = pd.read_parquet(config.PROCESSED / "dataset.parquet")
    print(f"dataset: {len(df)} filas. Backtest por anio (PR-AUC / recall en el 5% de mayor puntaje):")
    res = correr(df, a.rapido)
    s = res["resumen"]
    if not s:
        raise SystemExit("No hubo anios evaluables. Revisa que el dataset cubra varios anios con focos.")
    print("\nMedias sobre los anios evaluados:")
    print(pd.DataFrame(s["medias"]).T.round(3).to_string())
    print(f"\nEl modelo supera al mejor baseline en PR-AUC en {s['anios_modelo_supera_mejor_baseline']} "
          f"de {s['anios_evaluados']} anios.")
    (MODELS / "backtest.json").write_text(json.dumps(res, indent=1))
    print(f"Guardado en {MODELS / 'backtest.json'}")


if __name__ == "__main__":
    main()
