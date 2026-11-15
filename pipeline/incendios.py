"""Registro de incendios: agrupa las detecciones satelitales en eventos con cuando, donde y cuanto duro.

Un satelite no "ve un incendio": registra pixeles calientes en cada pasada. Un mismo incendio
deja muchas detecciones (varios pixeles por pasada, varias pasadas por dia, varios dias). Se las
agrupa en un evento cuando estan a menos de RADIO_M metros y a menos de GAP_H horas entre si
(componentes conexas en un espacio donde GAP_H horas equivalen a RADIO_M metros).

Importante para leer los resultados:
  - La duracion es la observada: primera a ultima deteccion. Es un MINIMO. Un satelite pasa cada
    pocas horas y las nubes tapan, asi que el fuego real pudo durar mas. Un evento de una sola
    pasada figura con duracion 0 ("puntual").
  - Se usan solo detecciones de confianza nominal o alta, igual que el modelo.
  - Eventos de mas de 14 dias se marcan "prolongado": pueden ser varios incendios encadenados o
    quemas recurrentes en una misma zona.

Uso:
    python -m pipeline.incendios
Genera data/processed/incendios.parquet y registro_incendios_catamarca.csv
"""
import numpy as np
import pandas as pd
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

from pipeline import config

RADIO_M = 3000
GAP_H = 48
PROLONGADO_DIAS = 14
EPOCH = pd.Timestamp("1970-01-01", tz="UTC")


def etiquetar(focos: pd.DataFrame, radio_m=RADIO_M, gap_h=GAP_H) -> np.ndarray:
    """Etiqueta de evento para cada foco (componentes conexas en espacio-tiempo)."""
    n = len(focos)
    if n == 0:
        return np.array([], dtype=int)
    lat, lon = focos["lat"].to_numpy(), focos["lon"].to_numpy()
    x = np.radians(lon) * 6371000.0 * np.cos(np.radians(lat.mean()))
    y = np.radians(lat) * 6371000.0
    # segundos desde 1970 sin depender de la resolucion del datetime (pandas 3 usa microsegundos)
    t_s = ((pd.to_datetime(focos["ts_utc"], utc=True) - EPOCH) / pd.Timedelta(seconds=1)).to_numpy()
    t_m = t_s / (gap_h * 3600.0) * radio_m
    pares = cKDTree(np.c_[x, y, t_m]).query_pairs(r=radio_m, output_type="ndarray")
    if not len(pares):
        return np.arange(n)
    g = coo_matrix((np.ones(len(pares), dtype=np.int8), (pares[:, 0], pares[:, 1])), shape=(n, n))
    return connected_components(g, directed=False)[1]


def tamano(n_celdas: int, n_focos: int) -> str:
    if n_focos == 1:
        return "puntual"
    if n_celdas >= 4 or n_focos >= 100:
        return "grande"
    if n_celdas >= 2 or n_focos >= 10:
        return "mediano"
    return "pequeno"


def construir(focos: pd.DataFrame, celda_depto: pd.DataFrame, radio_m=RADIO_M, gap_h=GAP_H) -> pd.DataFrame:
    f = focos[focos["confianza_cat"].isin(["nominal", "alta"])].copy()
    f = f.merge(celda_depto[["h3_cell", "departamento"]], on="h3_cell", how="left")
    f["ts_utc"] = pd.to_datetime(f["ts_utc"], utc=True)
    f = f.sort_values("ts_utc").reset_index(drop=True)
    f["ev"] = etiquetar(f, radio_m, gap_h)
    f["frp"] = f["frp_total_mw"].fillna(f["frp_mw"]).fillna(0.0)
    f["fecha_local"] = f["ts_utc"].dt.tz_convert(config.LOCAL_TZ).dt.date

    def centro(g):
        w = g["frp"].to_numpy()
        w = w if w.sum() > 0 else np.ones(len(g))
        return pd.Series({"lat": float(np.average(g["lat"], weights=w)), "lon": float(np.average(g["lon"], weights=w))})

    g = f.groupby("ev")
    ev = g.agg(inicio=("ts_utc", "min"), fin=("ts_utc", "max"), n_focos=("ts_utc", "size"),
               n_celdas=("h3_cell", "nunique"), dias_activos=("fecha_local", "nunique"),
               frp_max_mw=("frp", "max"), frp_total_mw=("frp", "sum"),
               departamento=("departamento", lambda s: s.mode().iat[0] if s.notna().any() else None),
               sensores=("instrumento", lambda s: "+".join(sorted(set(s))))).join(g.apply(centro, include_groups=False))
    ev["duracion_h"] = ((ev["fin"] - ev["inicio"]) / pd.Timedelta(hours=1)).round(1)
    ev["tamano"] = [tamano(c, n) for c, n in zip(ev["n_celdas"], ev["n_focos"])]
    ev["prolongado"] = ev["dias_activos"] > PROLONGADO_DIAS
    ev["anio"] = ev["inicio"].dt.tz_convert(config.LOCAL_TZ).dt.year
    ev["mes"] = ev["inicio"].dt.tz_convert(config.LOCAL_TZ).dt.month
    ev = ev.sort_values("inicio").reset_index(drop=True)
    ev.insert(0, "incendio_id", np.arange(1, len(ev) + 1))
    return ev


def main():
    focos = pd.read_parquet(config.PROCESSED / "focos.parquet")
    cd = pd.read_parquet(config.PROCESSED / "celda_depto.parquet")
    ev = construir(focos, cd)
    ev.to_parquet(config.PROCESSED / "incendios.parquet", index=False)

    csv = ev.copy()
    csv["inicio"] = csv["inicio"].dt.tz_convert(config.LOCAL_TZ).dt.strftime("%Y-%m-%d %H:%M")
    csv["fin"] = csv["fin"].dt.tz_convert(config.LOCAL_TZ).dt.strftime("%Y-%m-%d %H:%M")
    csv = csv.rename(columns={"incendio_id": "ID", "inicio": "Inicio (hora local)", "fin": "Fin (hora local)",
                              "duracion_h": "Duracion observada (h)", "dias_activos": "Dias con deteccion",
                              "departamento": "Departamento", "lat": "Latitud", "lon": "Longitud",
                              "n_focos": "Detecciones", "n_celdas": "Celdas H3", "frp_max_mw": "FRP maximo (MW)",
                              "frp_total_mw": "FRP total (MW)", "tamano": "Tamano", "prolongado": "Prolongado",
                              "sensores": "Sensores"}).drop(columns=["anio", "mes"])
    csv.round(4).to_csv(config.PROCESSED / "registro_incendios_catamarca.csv", index=False)

    print(f"{len(ev)} incendios (eventos) a partir de {int(ev['n_focos'].sum())} detecciones confiables")
    print("\nPor tamano:")
    print(ev["tamano"].value_counts().to_string())
    print("\nDuracion observada (horas), percentiles 50/75/90/99:",
          ev["duracion_h"].quantile([.5, .75, .9, .99]).round(1).tolist())
    print(f"Eventos prolongados (mas de {PROLONGADO_DIAS} dias): {int(ev['prolongado'].sum())}")
    print("\nPor anio:")
    print(ev.groupby("anio").agg(incendios=("incendio_id", "size"), dur_mediana_h=("duracion_h", "median"),
                                  dur_max_h=("duracion_h", "max")).round(1).to_string())
    print("\nLos 10 mas largos:")
    top = ev.sort_values("duracion_h", ascending=False).head(10)
    print(top[["incendio_id", "inicio", "duracion_h", "dias_activos", "n_focos", "n_celdas", "departamento"]]
          .assign(inicio=lambda d: d["inicio"].dt.strftime("%Y-%m-%d")).to_string(index=False))
    print(f"\nGuardado en {config.PROCESSED}")


if __name__ == "__main__":
    main()
