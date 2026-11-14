#!/usr/bin/env bash
# Descarga FIRMS (2 procesos, para no superar el limite de transacciones), reintenta
# los huecos y recien entonces arma focos, dataset y modelo.
# Uso: nohup bash scripts/run_pipeline.sh > data/pipeline_run.log 2>&1 &
cd "$(dirname "$0")/.." || exit 1
set -a; . ./.env; set +a
mkdir -p data

echo "[1] Esperando que la clave de FIRMS este libre..."
until curl -s "https://firms.modaps.eosdis.nasa.gov/api/area/csv/$FIRMS_MAP_KEY/VIIRS_SNPP_SP/-69.3,-29.6,-64.8,-24.9/1/2024-09-01" | head -1 | grep -q "^latitude"; do
  echo "  clave bloqueada por limite de transacciones, espero 60 s"; sleep 60
done

echo "[2] Descargando (VIIRS y MODIS en paralelo)"
python -u -m pipeline.ingest_firms --start 2012-01-20 --end 2026-08-31 --sources VIIRS_SNPP_SP > data/ingest_viirs.log 2>&1 &
PID_V=$!
(
  python -u -m pipeline.ingest_firms --start 2012-01-20 --end 2019-06-30 --sources MODIS_SP > data/ingest_modis_a.log 2>&1
  python -u -m pipeline.ingest_firms --start 2019-07-01 --end 2026-08-31 --sources MODIS_SP > data/ingest_modis_b.log 2>&1
) &
PID_M=$!
wait $PID_V $PID_M

echo "[3] Reintentando huecos (usa los mismos rangos para conservar la alineacion de ventanas)"
python -u -m pipeline.ingest_firms --start 2012-01-20 --end 2026-08-31 --sources VIIRS_SNPP_SP > data/reintento_viirs.log 2>&1
python -u -m pipeline.ingest_firms --start 2012-01-20 --end 2019-06-30 --sources MODIS_SP > data/reintento_modis_a.log 2>&1
python -u -m pipeline.ingest_firms --start 2019-07-01 --end 2026-08-31 --sources MODIS_SP > data/reintento_modis_b.log 2>&1
if grep -q FALLO data/reintento_*.log; then
  echo "QUEDAN FALLOS: revisar data/reintento_*.log"; exit 1
fi

echo "[4] Armonizacion, dataset y modelo"
python -m pipeline.harmonize && python -m pipeline.dataset && python -m pipeline.train
echo "[FIN]"
