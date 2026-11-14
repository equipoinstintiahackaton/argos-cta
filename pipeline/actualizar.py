"""Actualizacion de ARGOS con datos casi en tiempo real (FIRMS NRT + clima NASA POWER).

Pasos:
  1. Consulta que fechas ofrece FIRMS para MODIS_NRT y VIIRS_SNPP_NRT.
  2. Descarga los focos desde el dia siguiente al ultimo dato historico (SP) hasta hoy.
     Las ventanas recientes se vuelven a bajar siempre: NRT se completa con el paso de las horas.
  3. Rearma focos.parquet (armonizacion) y actualiza el clima solo con los dias nuevos.

Solo se usan MODIS y VIIRS Suomi NPP, los mismos sensores con que se entreno el modelo
(sumar NOAA-20/21 aumentaria el numero de detecciones y distorsionaria las variables).

Uso:
    python -m pipeline.actualizar
Despues:
    python -m pipeline.predict --fecha ultima
"""
import re
from datetime import date, timedelta
from io import StringIO

import pandas as pd
import requests

from pipeline import config, harmonize, ingest_firms, weather

AVAIL = "https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/{key}/{src}"
FUENTES_SP = ["MODIS_SP", "VIIRS_SNPP_SP"]
FUENTES_NRT = ["MODIS_NRT", "VIIRS_SNPP_NRT"]
REPETIR_DIAS = 12


def _ventana(nombre: str):
    m = re.match(r"(\d{4}-\d{2}-\d{2})_(\d+)d\.csv$", nombre)
    if not m:
        return None
    ini = date.fromisoformat(m.group(1))
    return ini, ini + timedelta(days=int(m.group(2)) - 1)


def ultimo_dia(carpeta) -> date | None:
    fines = [v[1] for f in carpeta.glob("*.csv") if (v := _ventana(f.name))]
    return max(fines) if fines else None


def limpiar_recientes(carpeta, desde: date) -> int:
    """Borra las ventanas que terminan en o despues de `desde` para volver a bajarlas."""
    n = 0
    for f in carpeta.glob("*.csv"):
        v = _ventana(f.name)
        if v and v[1] >= desde:
            f.unlink()
            n += 1
    return n


def disponibilidad(src: str):
    r = requests.get(AVAIL.format(key=config.FIRMS_MAP_KEY, src=src), timeout=60)
    r.raise_for_status()
    df = pd.read_csv(StringIO(r.text))
    if df.empty or "min_date" not in df.columns:
        return None
    return date.fromisoformat(str(df["min_date"].iloc[0])), date.fromisoformat(str(df["max_date"].iloc[0]))


def main():
    if not config.FIRMS_MAP_KEY:
        raise SystemExit("Falta FIRMS_MAP_KEY")
    fines = [ultimo_dia(config.RAW_FIRMS / s) for s in FUENTES_SP]
    if any(f is None for f in fines):
        raise SystemExit("Faltan datos historicos (SP). Corre antes la descarga completa.")
    fin_sp = min(fines)
    print(f"Datos historicos (SP) hasta {fin_sp}")

    hoy = date.today()
    hastas = {}
    for src in FUENTES_NRT:
        av = disponibilidad(src)
        if av is None:
            print(f"{src}: FIRMS no informa disponibilidad, se intenta igual")
        else:
            print(f"{src}: FIRMS ofrece del {av[0]} al {av[1]}")
        desde = max(fin_sp + timedelta(days=1), av[0]) if av else fin_sp + timedelta(days=1)
        hasta = min(hoy, av[1]) if av else hoy
        hastas[src] = hasta
        if desde > fin_sp + timedelta(days=1):
            print(f"  AVISO: hueco sin datos entre {fin_sp + timedelta(days=1)} y {desde - timedelta(days=1)}: "
                  "NRT no llega tan atras y SP todavia no lo publico. Los conteos de esos dias estaran subestimados.")
        carpeta = config.RAW_FIRMS / src
        carpeta.mkdir(parents=True, exist_ok=True)
        borradas = limpiar_recientes(carpeta, hasta - timedelta(days=REPETIR_DIAS))
        print(f"  descargando {desde} a {hasta} (se repiten {borradas} ventanas recientes)")
        filas = ingest_firms.download(src, desde, hasta)
        print(f"  filas nuevas: {filas}")

    for alt in ("VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"):
        carpeta = config.RAW_FIRMS / alt
        if carpeta.exists():
            limpiar_recientes(carpeta, date(2000, 1, 1))
    snpp_fin = hastas.get("VIIRS_SNPP_NRT")
    if snpp_fin and snpp_fin < hoy - timedelta(days=2):
        for alt in ("VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"):
            av = disponibilidad(alt)
            if av and av[1] > snpp_fin:
                desde = snpp_fin + timedelta(days=1)
                hasta = min(hoy, av[1])
                print(f"\nAVISO: VIIRS Suomi NPP solo llega al {snpp_fin}. Se completa con {alt} del {desde} al {hasta}.")
                print(f"  filas nuevas: {ingest_firms.download(alt, desde, hasta)}")
                break
        else:
            print(f"\nAVISO: no hay VIIRS despues del {snpp_fin}. El riesgo actual puede estar subestimado.")

    print("\nArmonizando focos ...")
    final = harmonize.run()
    ult = pd.to_datetime(final["fecha_utc"]).max().date()

    print("\nActualizando clima (solo dias nuevos) ...")
    weather.run(date(2012, 1, 1), hoy - timedelta(days=4), incremental=True)
    wx = pd.read_parquet(config.PROCESSED / "weather_points.parquet", columns=["fecha", "temp_c"])
    ult_wx = pd.to_datetime(wx.loc[wx["temp_c"].notna(), "fecha"]).max().date()

    recientes = final[pd.to_datetime(final["fecha_utc"]) > pd.Timestamp(ult - timedelta(days=7))]
    print(f"\nUltimo foco: {ult}. Ultimo dia de clima: {ult_wx}. Focos en los ultimos 7 dias: {len(recientes)}")
    print("Siguiente paso: python -m pipeline.predict --fecha ultima")


if __name__ == "__main__":
    main()
