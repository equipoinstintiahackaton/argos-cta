# ARGOS CTA

Sistema de alerta temprana de incendios para Catamarca, basado en datos
armonizados de MODIS y VIIRS (NASA FIRMS).

Aviso: usamos datos publicos de NASA FIRMS. No es un proyecto oficial de la NASA.

## Estructura

```
pipeline/   Python: ingesta, armonizacion, grilla, features, modelo
sql/        schema.sql para Supabase (PostGIS)
tests/      pruebas
web/        interfaz (mas adelante)
data/       datos locales (ignorado por git)
```

## Puesta en marcha (Codespace)

```bash
pip install -r requirements.txt
cp .env.example .env   # o usar Codespaces secrets: FIRMS_MAP_KEY, etc.
python -m pipeline.grid
python -m pipeline.ingest_firms --start 2024-01-01 --end 2024-12-31 --sources VIIRS_SNPP_SP MODIS_SP
python -m pipeline.harmonize
pytest -q
```

## Fase 1 (esta)

1. Grilla H3 de Catamarca (`pipeline/grid.py`).
2. Descarga de focos FIRMS por ventanas de 10 dias (`pipeline/ingest_firms.py`).
3. Armonizacion MODIS + VIIRS y deduplicacion (`pipeline/harmonize.py`).

## Proximas fases

- Features: clima (NASA POWER / Open-Meteo), NDVI y LST, estaticas.
- Modelo de probabilidad con validacion temporal.
- Alertas por umbral.
- Indicador de origen probable (reglas; apoyo, no determinante).
- Carga a Supabase y job diario con GitHub Actions.

## Seguridad

Las claves van en `.env` o Codespaces secrets. Nunca se suben al repositorio.
