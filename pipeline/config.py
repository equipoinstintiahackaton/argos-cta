"""Configuracion central del pipeline ARGOS."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW_FIRMS = DATA / "raw" / "firms"
PROCESSED = DATA / "processed"

for _p in (RAW_FIRMS, PROCESSED):
    _p.mkdir(parents=True, exist_ok=True)

# Bounding box un poco mas grande que Catamarca (oeste, sur, este, norte).
# Luego se recorta con el poligono provincial.
CATAMARCA_BBOX = (-69.3, -29.6, -64.8, -24.9)

# Resolucion H3: 6 ~ 36 km2 por celda (unas 3 mil celdas para la provincia).
H3_RES = 6

FIRMS_MAP_KEY = os.getenv("FIRMS_MAP_KEY", "")
FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"

# Fuentes FIRMS. SP = procesamiento estandar (historico), NRT = casi tiempo real.
SOURCES_HISTORIC = ["MODIS_SP", "VIIRS_SNPP_SP", "VIIRS_NOAA20_SP"]
SOURCES_NRT = ["MODIS_NRT", "VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"]

# Parametros de deduplicacion entre sensores.
DEDUP_RADIUS_M = 1000     # MODIS tiene pixel de 1 km
DEDUP_WINDOW_H = 3        # ventana temporal para considerar el mismo evento

# Zona horaria local (Argentina).
LOCAL_TZ = "America/Argentina/Catamarca"

# Fuentes termicas fijas (instalaciones industriales o mineras, volcanes, etc.):
# detecciones en el mismo bloque de ~2 km en muchos dias y varios anios. No son incendios.
STATIC_BIN_DEG = 0.02
STATIC_MIN_DIAS = 100
STATIC_MIN_ANIOS = 3
