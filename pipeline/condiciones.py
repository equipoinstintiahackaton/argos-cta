"""Condiciones meteorologicas que acompanaron a los focos historicos.

Compara el clima de los dias CON focos contra el de dias SIN focos de los mismos meses
(base). Asi se separa lo que es "clima de la epoca" de lo que de verdad se asocia al fuego.
La unidad es (punto de la grilla NASA POWER, dia). Un dia es "con foco" si alguna celda de
ese punto tuvo foco. La base excluye +-3 dias alrededor de cualquier foco del mismo punto y
toma 5 dias por cada dia con foco, en el mismo mes del anio.

Uso:
    python -m pipeline.condiciones
"""
import numpy as np
import pandas as pd

from pipeline import config

VARIABLES = ["temp_c", "temp_max_c", "humedad_pct", "viento_kmh", "vpd_kpa", "dias_sin_lluvia",
             "precip_30d", "precip_90d", "temp_anom", "humedad_anom"]


def calcular(focos: pd.DataFrame, celda_punto: pd.DataFrame, clima: pd.DataFrame,
             ratio: int = 5, margen: int = 3, seed: int = 42) -> pd.DataFrame:
    f = focos.merge(celda_punto, on="h3_cell")
    f["fecha"] = pd.to_datetime(f["fecha_utc"]).dt.normalize()
    fuego = f[["point_id", "fecha"]].drop_duplicates()

    clima = clima.copy()
    clima["fecha"] = pd.to_datetime(clima["fecha"]).dt.normalize()
    con = fuego.merge(clima, on=["point_id", "fecha"])

    excl = pd.concat([fuego.assign(fecha=fuego["fecha"] + pd.Timedelta(days=k))
                      for k in range(-margen, margen + 1)]).drop_duplicates()
    cand = clima.merge(excl, on=["point_id", "fecha"], how="left", indicator=True)
    cand = cand[cand["_merge"] == "left_only"].drop(columns="_merge")
    cand = cand[(cand["fecha"] >= con["fecha"].min()) & (cand["fecha"] <= con["fecha"].max())]

    # Base por estrato (punto, mes): cada lugar se compara consigo mismo en la misma epoca.
    rng = np.random.default_rng(seed)
    cand["mes"] = cand["fecha"].dt.month
    pools = {k: g for k, g in cand.groupby(["point_id", "mes"])}
    partes = []
    for (pid, mes), n in con.groupby(["point_id", con["fecha"].dt.month]).size().items():
        pool = pools.get((pid, mes))
        if pool is not None and len(pool):
            partes.append(pool.sample(n=min(len(pool), n * ratio), random_state=int(rng.integers(1 << 30))))
    base = pd.concat(partes)

    filas = []
    for var in VARIABLES:
        for grupo, d in (("foco", con), ("base", base)):
            v = d[var].dropna()
            if v.empty:
                continue
            q = v.quantile([0.10, 0.25, 0.50, 0.75, 0.90])
            filas.append({"variable": var, "grupo": grupo, "n": int(len(v)), "media": float(v.mean()),
                          "p10": float(q[0.10]), "p25": float(q[0.25]), "p50": float(q[0.50]),
                          "p75": float(q[0.75]), "p90": float(q[0.90])})
    return pd.DataFrame(filas)


def main():
    focos = pd.read_parquet(config.PROCESSED / "focos.parquet", columns=["h3_cell", "fecha_utc"])
    cp = pd.read_parquet(config.PROCESSED / "cell_point.parquet")
    clima = pd.read_parquet(config.PROCESSED / "weather_points.parquet", columns=["point_id", "fecha"] + VARIABLES)
    t = calcular(focos, cp, clima)
    t.to_parquet(config.PROCESSED / "condiciones_focos.parquet", index=False)

    w = t.pivot(index="variable", columns="grupo", values="p50")
    w["dif"] = w["foco"] - w["base"]
    print("Mediana en dias CON foco vs dias SIN foco de los mismos meses:")
    print(w.round(2).reindex(VARIABLES).to_string())
    print(f"\nGuardado {config.PROCESSED / 'condiciones_focos.parquet'}")


if __name__ == "__main__":
    main()
