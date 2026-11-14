"""Departamentos de Catamarca y asignacion de cada celda H3 a su departamento.

Descarga los limites ADM2 de Argentina (geoBoundaries), se queda con los que estan dentro de
la provincia y asigna cada celda por su centro. Guarda:
    data/processed/celda_depto.parquet     (h3_cell, departamento)
    data/processed/departamentos.geojson   (limites simplificados para el mapa)

Uso:
    python -m pipeline.departamentos
"""
import geopandas as gpd
import pandas as pd
import requests

from pipeline import config

GEOB_API = "https://www.geoboundaries.org/api/current/gbOpen/ARG/ADM2/"

# Catamarca tiene 16 departamentos. Estos tres son de provincias vecinas (Tucuman y Salta) y el
# limite provincial de geoBoundaries los roza: sus celdas se reparten entre los departamentos
# catamarquenos mas cercanos.
VECINOS = {"tafi del valle", "juan b. alberdi", "molinos"}
NOMBRES = {"Poman": "Pomán", "Paclin": "Paclín"}


def _clave(n: str) -> str:
    import unicodedata
    return unicodedata.normalize("NFKD", n).encode("ascii", "ignore").decode().lower().strip()


def solo_catamarca(g: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    g = g[~g["nombre"].map(_clave).isin(VECINOS)].copy()
    g["nombre"] = g["nombre"].map(lambda n: NOMBRES.get(n, n))
    return g.reset_index(drop=True)


def asignar(celdas: gpd.GeoDataFrame, deptos: gpd.GeoDataFrame) -> pd.DataFrame:
    """celdas: h3_cell + geometry (punto central). deptos: nombre + geometry (poligonos).
    Celda fuera de todo poligono (borde costero del grid) -> departamento mas cercano."""
    j = gpd.sjoin(celdas, deptos[["nombre", "geometry"]], how="left", predicate="within")
    j = j[~j.index.duplicated(keep="first")]
    falta = j["nombre"].isna()
    if falta.any():
        sin = celdas[falta.reindex(celdas.index, fill_value=False).to_numpy()]
        cerca = gpd.sjoin_nearest(sin.to_crs(3857), deptos[["nombre", "geometry"]].to_crs(3857), how="left")
        cerca = cerca[~cerca.index.duplicated(keep="first")]
        j.loc[cerca.index, "nombre"] = cerca["nombre"]
    return pd.DataFrame({"h3_cell": j["h3_cell"].to_numpy(), "departamento": j["nombre"].to_numpy()})


def main():
    meta = requests.get(GEOB_API, timeout=60)
    meta.raise_for_status()
    g = gpd.read_file(meta.json()["gjDownloadURL"]).to_crs(4326)
    col = next(c for c in ("shapeName", "NAME_2", "name") if c in g.columns)
    g = g.rename(columns={col: "nombre"})[["nombre", "geometry"]]

    prov = gpd.read_file(config.PROCESSED / "catamarca.geojson").to_crs(4326).geometry.union_all()
    g = g[g.geometry.representative_point().within(prov)].reset_index(drop=True)
    g = solo_catamarca(g)
    print(f"{len(g)} departamentos de Catamarca (se esperan 16): {sorted(g['nombre'])}")

    grid = gpd.read_parquet(config.PROCESSED / "grid.parquet")
    pts = gpd.GeoDataFrame({"h3_cell": grid["h3_cell"]},
                           geometry=gpd.points_from_xy(grid["lon"], grid["lat"]), crs=4326)
    cd = asignar(pts, g)
    cd.to_parquet(config.PROCESSED / "celda_depto.parquet", index=False)
    print(cd.groupby("departamento").size().sort_values(ascending=False).to_string())

    g["geometry"] = g.geometry.simplify(0.003, preserve_topology=True)
    g.to_file(config.PROCESSED / "departamentos.geojson", driver="GeoJSON")
    print("Guardado celda_depto.parquet y departamentos.geojson")


if __name__ == "__main__":
    main()
