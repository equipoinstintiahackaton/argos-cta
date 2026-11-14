"""Grilla H3 de Catamarca.

Descarga el limite provincial desde geoBoundaries (ADM1 de Argentina), lo
cubre con celdas H3 y guarda data/processed/grid.parquet y grid.geojson.

Uso:
    python -m pipeline.grid
"""
import json

import geopandas as gpd
import h3
import pandas as pd
import requests
from shapely.geometry import Polygon, shape

from pipeline import config

GEOB_API = "https://www.geoboundaries.org/api/current/gbOpen/ARG/ADM1/"


def get_catamarca_geometry():
    meta = requests.get(GEOB_API, timeout=60)
    meta.raise_for_status()
    gj_url = meta.json()["gjDownloadURL"]
    gdf = gpd.read_file(gj_url)
    col = next(c for c in ("shapeName", "NAME_1", "name") if c in gdf.columns)
    sel = gdf[gdf[col].str.contains("Catamarca", case=False, na=False)]
    if sel.empty:
        raise RuntimeError(f"No se encontro Catamarca. Nombres: {gdf[col].tolist()}")
    return sel.to_crs(4326).geometry.union_all()


def build_grid(geom, res: int = config.H3_RES) -> gpd.GeoDataFrame:
    polys = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
    cells = set()
    for p in polys:
        cells |= set(h3.h3shape_to_cells(h3.geo_to_h3shape(p), res))
    rows = []
    for c in sorted(cells):
        lat, lng = h3.cell_to_latlng(c)
        boundary = h3.cell_to_boundary(c)  # lista de (lat, lng)
        poly = Polygon([(lo, la) for la, lo in boundary])
        rows.append({"h3_cell": c, "lat": lat, "lon": lng, "geometry": poly})
    return gpd.GeoDataFrame(rows, geometry="geometry", crs=4326)


def main():
    geom = get_catamarca_geometry()
    grid = build_grid(geom)
    out_pq = config.PROCESSED / "grid.parquet"
    out_gj = config.PROCESSED / "grid.geojson"
    grid.to_parquet(out_pq)
    grid.to_file(out_gj, driver="GeoJSON")
    gpd.GeoSeries([geom], crs=4326).to_file(config.PROCESSED / "catamarca.geojson", driver="GeoJSON")
    print(f"{len(grid)} celdas H3 res {config.H3_RES}. Guardado en {out_pq}")


if __name__ == "__main__":
    main()
