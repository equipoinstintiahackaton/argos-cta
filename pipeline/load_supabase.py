"""Carga de resultados a Supabase (Postgres + PostGIS) por conexion directa.

Requiere la variable de entorno SUPABASE_DB_URL (cadena de conexion del pooler).
Las cargas son idempotentes: se pueden repetir sin duplicar datos.

Uso:
    python -m pipeline.load_supabase --que celdas focos
    python -m pipeline.load_supabase --que departamentos estadisticas
    python -m pipeline.load_supabase --que riesgo riesgo_depto alertas --fecha 2024-09-10
"""
import argparse
import json
import os

import geopandas as gpd
import pandas as pd
import psycopg

from pipeline import config

LOTE = 2000
MODELO_VERSION = "xgb-v1"
MODELS = config.ROOT / "models"


def conectar():
    url = os.getenv("SUPABASE_DB_URL")
    if not url:
        raise SystemExit("Falta SUPABASE_DB_URL (secreto del Codespace o .env)")
    return psycopg.connect(url)


def filas(df: pd.DataFrame) -> list:
    """DataFrame -> lista de tuplas con tipos nativos de Python y None en lugar de NaN.
    psycopg no adapta tipos de numpy, por eso se pasa por object."""
    df = df.astype(object).where(df.notna(), None)
    return list(df.itertuples(index=False, name=None))


def _ejecutar(cur, sql: str, rows: list):
    for i in range(0, len(rows), LOTE):
        cur.executemany(sql, rows[i:i + LOTE])


def cargar_celdas(conn):
    g = gpd.read_parquet(config.PROCESSED / "grid.parquet")
    df = pd.DataFrame({
        "h3_cell": g["h3_cell"], "lat": g["lat"], "lon": g["lon"],
        "wkt": g.geometry.to_wkt(),
    })
    sql = """
        insert into celdas (h3_cell, lat, lon, geom)
        values (%s, %s, %s, ST_GeomFromText(%s, 4326))
        on conflict (h3_cell) do update
        set lat = excluded.lat, lon = excluded.lon, geom = excluded.geom
    """
    with conn.cursor() as cur:
        _ejecutar(cur, sql, filas(df))
    conn.commit()
    print(f"celdas: {len(df)} cargadas")


def cargar_focos(conn):
    f = pd.read_parquet(config.PROCESSED / "focos.parquet")
    celdas = set(pd.read_parquet(config.PROCESSED / "grid.parquet", columns=["h3_cell"])["h3_cell"])
    antes = len(f)
    f = f[f["h3_cell"].isin(celdas)]          # descarta focos fuera del poligono provincial
    cols = ["foco_id", "lon", "lat", "h3_cell", "ts_utc", "hora_local", "instrumento",
            "satelite", "res_m", "brillo_k", "frp_mw", "confianza_cat", "confianza_num",
            "dia_noche", "n_detecciones", "fuentes", "frp_total_mw", "n_pixeles"]
    sql = """
        insert into focos (foco_id, geom, h3_cell, ts_utc, hora_local, instrumento, satelite,
                           res_m, brillo_k, frp_mw, confianza_cat, confianza_num, dia_noche,
                           n_detecciones, fuentes, frp_total_mw, n_pixeles)
        values (%s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (foco_id) do update set
            geom = excluded.geom, h3_cell = excluded.h3_cell, ts_utc = excluded.ts_utc,
            hora_local = excluded.hora_local, instrumento = excluded.instrumento,
            satelite = excluded.satelite, res_m = excluded.res_m, brillo_k = excluded.brillo_k,
            frp_mw = excluded.frp_mw, confianza_cat = excluded.confianza_cat,
            confianza_num = excluded.confianza_num, dia_noche = excluded.dia_noche,
            n_detecciones = excluded.n_detecciones, fuentes = excluded.fuentes,
            frp_total_mw = excluded.frp_total_mw, n_pixeles = excluded.n_pixeles
    """
    with conn.cursor() as cur:
        _ejecutar(cur, sql, filas(f[cols]))
    conn.commit()
    print(f"focos: {len(f)} cargados ({antes - len(f)} fuera de la grilla descartados)")


def cargar_riesgo(conn, fecha: str):
    r = pd.read_parquet(config.PROCESSED / f"riesgo_{fecha}.parquet")
    r["fecha"] = pd.to_datetime(r["fecha"]).dt.date
    r["modelo"] = MODELO_VERSION
    for c in ("indice", "banda"):
        if c not in r.columns:
            r[c] = None
    df = r[["h3_cell", "fecha", "probabilidad", "nivel", "modelo", "indice", "banda"]]
    sql = """
        insert into riesgo (h3_cell, fecha, probabilidad, nivel, modelo_version, indice, banda)
        values (%s, %s, %s, %s, %s, %s, %s)
        on conflict (h3_cell, fecha) do update set
            probabilidad = excluded.probabilidad, nivel = excluded.nivel,
            modelo_version = excluded.modelo_version, indice = excluded.indice, banda = excluded.banda
    """
    with conn.cursor() as cur:
        _ejecutar(cur, sql, filas(df))
    conn.commit()
    print(f"riesgo {fecha}: {len(df)} celdas cargadas")


def cargar_alertas(conn, fecha: str):
    a = pd.read_parquet(config.PROCESSED / f"alertas_{fecha}.parquet")
    a["fecha"] = pd.to_datetime(a["fecha"]).dt.date
    for c in ("indice", "banda"):
        if c not in a.columns:
            a[c] = None
    df = a[["h3_cell", "fecha", "nivel", "probabilidad", "motivo", "indice", "banda"]]
    sql = ("insert into alertas (h3_cell, fecha, nivel, probabilidad, motivo, indice, banda) "
           "values (%s, %s, %s, %s, %s, %s, %s)")
    with conn.cursor() as cur:
        cur.execute("delete from alertas where fecha = %s", (pd.Timestamp(fecha).date(),))
        _ejecutar(cur, sql, filas(df))
    conn.commit()
    print(f"alertas {fecha}: {len(df)} cargadas")


def cargar_departamentos(conn):
    cd = pd.read_parquet(config.PROCESSED / "celda_depto.parquet")
    gj = json.loads((config.PROCESSED / "departamentos.geojson").read_text())
    geoms = {f["properties"]["nombre"]: f["geometry"] for f in gj["features"]}
    n = cd.groupby("departamento").size()
    rows = [(nom, int(n.get(nom, 0)), json.dumps(geom)) for nom, geom in geoms.items()]
    with conn.cursor() as cur:
        cur.execute("delete from departamentos where not (nombre = any(%s))", (list(geoms),))
        cur.executemany(
            "insert into departamentos (nombre, n_celdas, geojson) values (%s, %s, %s::jsonb) "
            "on conflict (nombre) do update set n_celdas = excluded.n_celdas, geojson = excluded.geojson", rows)
        _ejecutar(cur, "update celdas set departamento = %s where h3_cell = %s",
                  filas(cd[["departamento", "h3_cell"]]))
    conn.commit()
    print(f"departamentos: {len(rows)} cargados, {len(cd)} celdas asignadas")


def cargar_condiciones(conn):
    c = pd.read_parquet(config.PROCESSED / "condiciones_focos.parquet")
    with conn.cursor() as cur:
        cur.execute("truncate condiciones_focos")
        _ejecutar(cur, "insert into condiciones_focos (variable, grupo, n, media, p10, p25, p50, p75, p90) "
                       "values (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                  filas(c[["variable", "grupo", "n", "media", "p10", "p25", "p50", "p75", "p90"]]))
    conn.commit()
    print(f"condiciones: {len(c)} filas cargadas")


def cargar_riesgo_depto(conn, fecha: str):
    r = pd.read_parquet(config.PROCESSED / f"riesgo_depto_{fecha}.parquet")
    r["fecha"] = pd.to_datetime(r["fecha"]).dt.date
    df = r[["departamento", "fecha", "probabilidad", "banda", "n_celdas"]]
    sql = """
        insert into riesgo_depto (departamento, fecha, probabilidad, banda, n_celdas)
        values (%s, %s, %s, %s, %s)
        on conflict (departamento, fecha) do update set
            probabilidad = excluded.probabilidad, banda = excluded.banda, n_celdas = excluded.n_celdas
    """
    with conn.cursor() as cur:
        _ejecutar(cur, sql, filas(df))
    conn.commit()
    print(f"riesgo_depto {fecha}: {len(df)} departamentos cargados")


def cargar_estadisticas(conn):
    m = pd.read_parquet(config.PROCESSED / "stats_mensual.parquet")
    h = pd.read_parquet(config.PROCESSED / "stats_hora.parquet")
    with conn.cursor() as cur:
        cur.execute("truncate stats_mensual")
        _ejecutar(cur, "insert into stats_mensual (anio, mes, departamento, focos, focos_confiables, "
                       "frp_total_mw, celdas_afectadas) values (%s, %s, %s, %s, %s, %s, %s)",
                  filas(m[["anio", "mes", "departamento", "focos", "focos_confiables",
                           "frp_total_mw", "celdas_afectadas"]]))
        cur.execute("truncate stats_hora")
        _ejecutar(cur, "insert into stats_hora (departamento, hora, focos) values (%s, %s, %s)",
                  filas(h[["departamento", "hora_local", "focos"]]))
        esc = json.loads((MODELS / "escala.json").read_text()) if (MODELS / "escala.json").exists() else None
        if esc:
            cur.execute("truncate escala_bandas")
            rows = [(r["banda"], i, r["desde"], r["hasta"], r["frac_celdas_dia"],
                     r["frecuencia_observada"], r["lift"]) for i, r in enumerate(esc["tabla_prueba"])]
            cur.executemany("insert into escala_bandas (banda, orden, desde, hasta, frac_celdas_dia, "
                            "frecuencia_observada, lift) values (%s, %s, %s, %s, %s, %s, %s)", rows)
        cal = json.loads((MODELS / "calib_deptos.json").read_text()) if (MODELS / "calib_deptos.json").exists() else None
        if cal:
            cur.execute("truncate calibracion_depto")
            rows = [(r["banda"], i, r["n"], r["prometido"], r["observado"])
                    for i, r in enumerate(cal["confiabilidad_prueba"])]
            cur.executemany("insert into calibracion_depto (banda, orden, n, prometido, observado) "
                            "values (%s, %s, %s, %s, %s)", rows)
    conn.commit()
    print(f"estadisticas: {len(m)} filas mensuales, {len(h)} filas por hora"
          f"{', escala' if esc else ''}{', calibracion' if cal else ''}")


def cargar_auditoria(conn):
    aud = json.loads((config.PROCESSED / "auditoria.json").read_text())
    cob = pd.read_parquet(config.PROCESSED / "auditoria_cobertura.parquet")
    with conn.cursor() as cur:
        cur.execute("truncate auditoria")
        cur.executemany("insert into auditoria (orden, chequeo, estado, detalle) values (%s, %s, %s, %s)",
                        [(i, c["chequeo"], c["estado"], c["detalle"]) for i, c in enumerate(aud)])
        cur.execute("truncate auditoria_cobertura")
        _ejecutar(cur, "insert into auditoria_cobertura (anio, sensor, focos, dias_con_focos) values (%s, %s, %s, %s)",
                  filas(cob[["anio", "sensor", "focos", "dias_con_focos"]]))
    conn.commit()
    print(f"auditoria: {len(aud)} chequeos, {len(cob)} filas de cobertura")


def cargar_backtest(conn):
    bt = json.loads((MODELS / "backtest.json").read_text())
    df = pd.DataFrame(bt["filas"])
    cols = ["anio", "modelo", "positivos", "tasa_base", "pr_auc", "roc_auc", "brier",
            "recall_top5", "recall_top10", "lift_top5"]
    with conn.cursor() as cur:
        cur.execute("truncate backtest")
        _ejecutar(cur, "insert into backtest (" + ", ".join(cols) + ") values (" + ", ".join(["%s"] * len(cols)) + ")",
                  filas(df[cols]))
    conn.commit()
    print(f"backtest: {len(df)} filas")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--que", nargs="+", required=True,
                    choices=["celdas", "departamentos", "focos", "estadisticas", "condiciones", "auditoria", "backtest", "riesgo", "riesgo_depto", "alertas"])
    ap.add_argument("--fecha", help="YYYY-MM-DD (para riesgo y alertas)")
    a = ap.parse_args()
    if any(k in a.que for k in ("riesgo", "riesgo_depto", "alertas")) and not a.fecha:
        raise SystemExit("--fecha es obligatoria para riesgo, riesgo_depto y alertas")

    if a.fecha == "ultima":
        from pipeline.predict import ultima_fecha
        a.fecha = ultima_fecha()
        print(f"fecha: {a.fecha}")

    # El orden importa por las claves foraneas: celdas -> departamentos -> focos -> riesgo -> alertas
    with conectar() as conn:
        if "celdas" in a.que:
            cargar_celdas(conn)
        if "departamentos" in a.que:
            cargar_departamentos(conn)
        if "focos" in a.que:
            cargar_focos(conn)
        if "estadisticas" in a.que:
            cargar_estadisticas(conn)
        if "condiciones" in a.que:
            cargar_condiciones(conn)
        if "auditoria" in a.que:
            cargar_auditoria(conn)
        if "backtest" in a.que:
            cargar_backtest(conn)
        if "riesgo" in a.que:
            cargar_riesgo(conn, a.fecha)
        if "riesgo_depto" in a.que:
            cargar_riesgo_depto(conn, a.fecha)
        if "alertas" in a.que:
            cargar_alertas(conn, a.fecha)


if __name__ == "__main__":
    main()
