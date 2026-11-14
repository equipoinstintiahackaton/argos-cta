"""Estadisticas del historial de focos por departamento, mes y hora.

Genera tablas resumen (para el panel web) y el ranking mensual por departamento en el
formato de la planilla del equipo (Anio, Mes, Departamento, Cantidad de focos, Puesto del mes).

Uso:
    python -m pipeline.estadisticas
"""
import pandas as pd

from pipeline import config

MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto",
         "Septiembre", "Octubre", "Noviembre", "Diciembre"]


def calcular(focos: pd.DataFrame, celda_depto: pd.DataFrame) -> dict:
    d = focos.merge(celda_depto, on="h3_cell")
    d["fecha"] = pd.to_datetime(d["fecha_utc"])
    d["anio"] = d["fecha"].dt.year
    d["mes"] = d["fecha"].dt.month
    d["confiable"] = (d["confianza_cat"] != "baja").astype(int)

    mensual = d.groupby(["anio", "mes", "departamento"], as_index=False).agg(
        focos=("h3_cell", "size"), focos_confiables=("confiable", "sum"),
        frp_total_mw=("frp_total_mw", "sum"), celdas_afectadas=("h3_cell", "nunique"))

    hora = d.dropna(subset=["hora_local"]).groupby(["departamento", "hora_local"], as_index=False).agg(
        focos=("h3_cell", "size"))
    hora["hora_local"] = hora["hora_local"].astype(int)

    # ranking: todos los departamentos en cada mes con datos (los sin focos valen 0)
    deptos = sorted(celda_depto["departamento"].unique())
    meses = mensual[["anio", "mes"]].drop_duplicates().sort_values(["anio", "mes"])
    base = meses.merge(pd.DataFrame({"departamento": deptos}), how="cross")
    r = base.merge(mensual[["anio", "mes", "departamento", "focos"]], how="left",
                   on=["anio", "mes", "departamento"]).fillna({"focos": 0})
    r["focos"] = r["focos"].astype(int)
    r["puesto"] = r.groupby(["anio", "mes"])["focos"].rank(method="min", ascending=False).astype(int)
    r.loc[r["focos"] == 0, "puesto"] = pd.NA
    return {"mensual": mensual, "hora": hora, "ranking": r}


def main():
    focos = pd.read_parquet(config.PROCESSED / "focos.parquet")
    cd = pd.read_parquet(config.PROCESSED / "celda_depto.parquet")
    t = calcular(focos, cd)
    t["mensual"].to_parquet(config.PROCESSED / "stats_mensual.parquet", index=False)
    t["hora"].to_parquet(config.PROCESSED / "stats_hora.parquet", index=False)

    r = t["ranking"].copy()
    r["Mes"] = r["mes"].map(lambda m: MESES[m - 1])
    out = r.rename(columns={"anio": "Año", "departamento": "Departamento",
                            "focos": "Cantidad de focos", "puesto": "Puesto del mes"})
    out[["Año", "Mes", "Departamento", "Cantidad de focos", "Puesto del mes"]].to_csv(
        config.PROCESSED / "ranking_mensual.csv", index=False)

    anual = t["mensual"].groupby("anio")["focos"].sum()
    print("Focos por anio:")
    print(anual.to_string())
    print("\nTop departamentos (total historico):")
    print(t["mensual"].groupby("departamento")["focos"].sum().sort_values(ascending=False).head(8).to_string())
    print(f"\nGuardado stats_mensual, stats_hora y ranking_mensual.csv en {config.PROCESSED}")


if __name__ == "__main__":
    main()
