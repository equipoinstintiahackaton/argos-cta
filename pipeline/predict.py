"""Prediccion de riesgo por celda para una fecha, con niveles y alertas.

Uso:
    python -m pipeline.predict --fecha 2024-09-10

Si la fecha + 7 dias cae dentro de los datos descargados, es una REPETICION
(replay): se compara lo que el sistema habria alertado ese dia contra lo que
realmente paso en los 7 dias siguientes. Es la mejor forma de mostrar el sistema
funcionando en una demo.

Genera:
    data/processed/riesgo_<fecha>.parquet    (todas las celdas: probabilidad y nivel)
    data/processed/alertas_<fecha>.parquet   (celdas en nivel alto o critico, con motivo)
"""
import argparse
import json

import numpy as np
import pandas as pd
import xgboost as xgb

from pipeline import config, dataset, escala

MODELS = config.ROOT / "models"
ORDEN = ["bajo", "medio", "alto", "critico"]


def asignar_nivel(p: np.ndarray, th: dict) -> np.ndarray:
    return np.select(
        [p >= th["critico"], p >= th["alto"], p >= th["medio"]],
        ["critico", "alto", "medio"],
        default="bajo",
    )


FRASES = {
    # variable: (grupo, frase). Dentro de un grupo solo se muestra la variable que mas aporta.
    "fuego_hist_anual": ("historial", "zona con historial frecuente de focos"),
    "fuego_90d": ("fuego_celda", "{v:.0f} focos en la celda en 90 dias"),
    "fuego_30d": ("fuego_celda", "{v:.0f} focos en la celda en 30 dias"),
    "fuego_7d": ("fuego_celda", "{v:.0f} focos en la celda esta semana"),
    "vecinos_7d": ("vecinos", "{v:.0f} focos en celdas vecinas esta semana"),
    "doy_sin": ("epoca", "epoca del anio de mayor actividad de fuego"),
    "doy_cos": ("epoca", "epoca del anio de mayor actividad de fuego"),
    "dias_sin_lluvia": ("lluvia", "{v:.0f} dias sin lluvia"),
    "precip_30d": ("lluvia", "poca lluvia acumulada ({v:.0f} mm en 30 dias)"),
    "precip_90d": ("lluvia", "poca lluvia acumulada ({v:.0f} mm en 90 dias)"),
    "precip_mm": ("lluvia", "sin lluvia reciente"),
    "humedad_pct": ("humedad", "humedad relativa de {v:.0f}%"),
    "humedad_7d": ("humedad", "humedad media semanal de {v:.0f}%"),
    "humedad_anom": ("humedad", "humedad {v:+.0f} puntos respecto de lo normal"),
    "vpd_kpa": ("aire_seco", "aire muy seco (VPD {v:.1f} kPa)"),
    "viento_kmh": ("viento", "viento de {v:.0f} km/h"),
    "temp_c": ("temperatura", "temperatura de {v:.0f} C"),
    "temp_max_c": ("temperatura", "maxima de {v:.0f} C"),
    "temp_7d": ("temperatura", "temperatura media semanal de {v:.0f} C"),
    "temp_anom": ("temperatura", "temperatura {v:+.1f} C respecto de lo normal"),
}


def explicar(valores: pd.Series, contrib: pd.Series, k: int = 3, min_contrib: float = 0.05) -> str:
    """Frase con las variables que mas empujaron el riesgo de ESTA celda (contribuciones SHAP,
    en escala log-odds). Muestra a lo sumo k, una por grupo de conceptos."""
    vistos, partes = set(), []
    for feat in contrib.sort_values(ascending=False).index:
        if contrib[feat] < min_contrib or feat not in FRASES:
            continue
        grupo, frase = FRASES[feat]
        if grupo in vistos:
            continue
        vistos.add(grupo)
        partes.append(frase.format(v=valores[feat]))
        if len(partes) == k:
            break
    return "; ".join(partes) if partes else "combinacion de condiciones y epoca del anio"


def ultima_fecha() -> str:
    """Ultimo dia con focos Y clima disponibles: la situacion mas reciente que se puede calcular.
    El clima de NASA POWER llega con unos 3 a 5 dias de retraso."""
    f = pd.to_datetime(pd.read_parquet(config.PROCESSED / "focos.parquet", columns=["fecha_utc"])["fecha_utc"]).max()
    w = pd.read_parquet(config.PROCESSED / "weather_points.parquet", columns=["fecha", "temp_c"])
    c = pd.to_datetime(w.loc[w["temp_c"].notna(), "fecha"]).max()
    return min(f, c).strftime("%Y-%m-%d")


def predecir(fecha: str, start: str = "2012-05-01") -> pd.DataFrame:
    meta = json.loads((MODELS / "meta.json").read_text())
    model = xgb.XGBClassifier()
    model.load_model(MODELS / "argos_xgb.json")

    f = pd.read_parquet(config.PROCESSED / "focos.parquet", columns=["fecha_utc"])
    ultimo_foco = pd.to_datetime(f["fecha_utc"]).max()
    d = pd.Timestamp(fecha)
    if d > ultimo_foco:
        print(f"AVISO: el historial de focos llega al {ultimo_foco.date()}. Para fechas posteriores "
              "faltan focos recientes (hay que bajar los *_NRT) y el riesgo estara subestimado.")
    end = min(ultimo_foco, d + pd.Timedelta(days=dataset.HORIZON))
    end = max(end, d)

    df = dataset.build(start, end.strftime("%Y-%m-%d"), dia_objetivo=fecha)
    p = model.predict_proba(df[meta["features"]])[:, 1]
    df["probabilidad"] = p
    df["nivel"] = asignar_nivel(p, meta["thresholds"])
    esc = escala.cargar("escala.json")
    if esc:
        df["indice"] = escala.indice(p, esc["p_anclas"]).round(1)
        df["banda"] = escala.banda(df["indice"])

    feats = meta["features"]
    contrib = model.get_booster().predict(
        xgb.DMatrix(df[feats]), pred_contribs=True, validate_features=False)[:, :-1]
    contrib = pd.DataFrame(contrib, columns=feats, index=df.index)
    vals = df[feats]
    df["motivo"] = [explicar(vals.loc[i], contrib.loc[i]) for i in df.index]
    return df


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fecha", required=True, help="YYYY-MM-DD, o \"ultima\" para la situacion mas reciente")
    a = ap.parse_args()

    if a.fecha == "ultima":
        a.fecha = ultima_fecha()
        print(f"Situacion mas reciente calculable: {a.fecha}")
    df = predecir(a.fecha)
    grid = pd.read_parquet(config.PROCESSED / "grid.parquet")[["h3_cell", "lat", "lon"]]
    extra = [c for c in ("indice", "banda") if c in df.columns]
    out = df[["h3_cell", "fecha", "probabilidad", "nivel", "y"] + extra].merge(grid, on="h3_cell")
    out = out.rename(columns={"y": "foco_real_7d"})
    out.to_parquet(config.PROCESSED / f"riesgo_{a.fecha}.parquet", index=False)

    print(f"\nRiesgo al {a.fecha}: {len(out)} celdas")
    print(out["nivel"].value_counts().reindex(ORDEN).fillna(0).astype(int).to_string())

    if "indice" in df.columns:                     # alerta = indice >= 45 (naranja fuerte o mas)
        al = df[df["indice"] >= escala.UMBRAL_ALERTA].copy()
    else:
        al = df[df["nivel"].isin(["alto", "critico"])].copy()
    al = al[["h3_cell", "fecha", "nivel", "probabilidad", "motivo"] + extra].merge(grid, on="h3_cell")
    al = al.sort_values("probabilidad", ascending=False)
    al.to_parquet(config.PROCESSED / f"alertas_{a.fecha}.parquet", index=False)
    print(f"\nAlertas (alto/critico): {len(al)}")
    print(al.head(10)[["h3_cell", "nivel", "probabilidad", "motivo"]].to_string(index=False))

    calib = escala.cargar("calib_deptos.json")
    cd_path = config.PROCESSED / "celda_depto.parquet"
    if calib and cd_path.exists():
        rd = escala.probabilidad_depto(df, pd.read_parquet(cd_path), calib)
        rd.to_parquet(config.PROCESSED / f"riesgo_depto_{a.fecha}.parquet", index=False)
        print("\nProbabilidad de al menos un foco en 7 dias, por departamento:")
        print(rd.sort_values("probabilidad", ascending=False)
                .assign(probabilidad=lambda x: (x["probabilidad"] * 100).round(1))
                [["departamento", "probabilidad", "banda"]].to_string(index=False))
    elif "indice" in df.columns:
        print("\n(Faltan celda_depto.parquet o calib_deptos.json: se omite la probabilidad por departamento)")

    evaluable = out["foco_real_7d"] >= 0
    if evaluable.all():
        print("\nREPETICION: que paso realmente en los 7 dias siguientes")
        total = int((out["foco_real_7d"] == 1).sum())
        print(f"  celdas con foco real: {total}")
        for nivel in ORDEN[1:]:
            sel = out["nivel"] == nivel
            hit = int(((out["foco_real_7d"] == 1) & sel).sum())
            print(f"  nivel {nivel:<8} {int(sel.sum()):>5} celdas, con foco real: {hit}")
        cubiertos = int(((out["foco_real_7d"] == 1) & out["nivel"].isin(["alto", "critico"])).sum())
        print(f"  focos reales en celdas alto/critico: {cubiertos} de {total}")


if __name__ == "__main__":
    main()
