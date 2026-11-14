"""Descarga de focos de calor desde NASA FIRMS (Area API) por ventanas de 10 dias.

Uso:
    python -m pipeline.ingest_firms --start 2024-01-01 --end 2024-12-31 --sources VIIRS_SNPP_SP MODIS_SP

La MAP_KEY se lee de la variable de entorno FIRMS_MAP_KEY (nunca va en el codigo).
Los CSV crudos se guardan en data/raw/firms/<fuente>/<fecha_inicio>.csv y se
omiten si ya existen, asi se puede reanudar una descarga interrumpida.
"""
import argparse
import time
from datetime import date, datetime, timedelta

import requests

from pipeline import config

MAX_DAYS = 5  # limite de la Area API por pedido


def _windows(start: date, end: date):
    cur = start
    while cur <= end:
        n = min(MAX_DAYS, (end - cur).days + 1)
        yield cur, n
        cur += timedelta(days=n)


def fetch_window(source: str, start: date, n_days: int, retries: int = 4) -> str:
    west, south, east, north = config.CATAMARCA_BBOX
    url = (
        f"{config.FIRMS_BASE}/{config.FIRMS_MAP_KEY}/{source}/"
        f"{west},{south},{east},{north}/{n_days}/{start.isoformat()}"
    )
    for attempt in range(retries):
        try:
            r = requests.get(url, timeout=60)
            if r.status_code == 200:
                return r.text
            if r.status_code in (400, 401, 403):
                raise RuntimeError(f"FIRMS rechazo el pedido ({r.status_code}): {r.text[:200]!r}")
            wait = 2 ** attempt * 5
            print(f"  HTTP {r.status_code} en {source} {start}, reintento en {wait}s")
        except requests.RequestException as exc:
            wait = 2 ** attempt * 5
            print(f"  Error de red ({exc.__class__.__name__}), reintento en {wait}s")
        time.sleep(wait)
    raise RuntimeError(f"No se pudo descargar {source} {start}")


def download(source: str, start: date, end: date, pause: float = 0.5) -> int:
    out_dir = config.RAW_FIRMS / source
    out_dir.mkdir(parents=True, exist_ok=True)
    total_rows = 0
    for w_start, n_days in _windows(start, end):
        target = out_dir / f"{w_start.isoformat()}_{n_days}d.csv"
        if target.exists():
            continue
        text = fetch_window(source, w_start, n_days)
        # Respuestas de error de FIRMS vienen como texto sin cabecera de columnas.
        if not text.lstrip().lower().startswith("latitude"):
            raise RuntimeError(f"Respuesta inesperada de FIRMS: {text[:200]!r}")
        target.write_text(text, encoding="utf-8")
        total_rows += max(0, text.count("\n") - 1)
        time.sleep(pause)
    return total_rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", required=True, help="YYYY-MM-DD")
    ap.add_argument("--end", required=True, help="YYYY-MM-DD")
    ap.add_argument("--sources", nargs="+", default=config.SOURCES_HISTORIC)
    args = ap.parse_args()

    if not config.FIRMS_MAP_KEY:
        raise SystemExit("Falta FIRMS_MAP_KEY (variable de entorno o .env)")

    start = datetime.strptime(args.start, "%Y-%m-%d").date()
    end = datetime.strptime(args.end, "%Y-%m-%d").date()
    for src in args.sources:
        print(f"== {src}: {start} a {end}")
        rows = download(src, start, end)
        print(f"   filas nuevas: {rows}")


if __name__ == "__main__":
    main()
