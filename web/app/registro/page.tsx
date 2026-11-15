"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "../../components/Shell";
import Barras from "../../components/Barras";
import { traerTodo } from "../../lib/datos";
import { num, fecha, fechaCorta, duracion } from "../../lib/formato";
import { useIdioma } from "../../lib/i18n";

type Inc = {
  incendio_id: number; inicio: string; fin: string; duracion_h: number; dias_activos: number;
  n_focos: number; n_celdas: number; lat: number; lon: number; departamento: string | null;
  frp_max_mw: number | null; frp_total_mw: number | null; tamano: string; prolongado: boolean; anio: number; mes: number;
};

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MESES_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TAM_EN: Record<string, string> = { puntual: "single detection", pequeno: "small", mediano: "medium", grande: "large" };

const MIN_DUR: { label: string; en: string; horas: number }[] = [
  { label: "Cualquiera", en: "Any", horas: -1 }, { label: "Mas de 1 pasada", en: "More than 1 pass", horas: 0.05 },
  { label: "12 h o mas", en: "12 h or more", horas: 12 }, { label: "1 dia o mas", en: "1 day or more", horas: 24 }, { label: "3 dias o mas", en: "3 days or more", horas: 72 }, { label: "7 dias o mas", en: "7 days or more", horas: 168 },
];

function Contenido() {
  const { tr, lang } = useIdioma();
  const tamTxt = (t: string) => (lang === "en" ? TAM_EN[t] ?? t : t);
  const [datos, setDatos] = useState<Inc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [anio, setAnio] = useState("Todos");
  const [depto, setDepto] = useState("Todos");
  const [tam, setTam] = useState("Todos");
  const [minDur, setMinDur] = useState(-1);
  const [limite, setLimite] = useState(100);

  useEffect(() => {
    (async () => {
      try {
        setDatos(await traerTodo<Inc>("incendios",
          "incendio_id,inicio,fin,duracion_h,dias_activos,n_focos,n_celdas,lat,lon,departamento,frp_max_mw,frp_total_mw,tamano,prolongado,anio,mes", [], "inicio"));
      } catch (e: any) { setError(e?.message ?? tr("Error al leer Supabase", "Error reading Supabase")); }
    })();
  }, []);

  const anios = useMemo(() => Array.from(new Set(datos.map((d) => d.anio))).sort(), [datos]);
  const deptos = useMemo(() => Array.from(new Set(datos.map((d) => d.departamento ?? "Sin dato"))).sort(), [datos]);
  const f = useMemo(() => datos.filter((d) =>
    (anio === "Todos" || d.anio === Number(anio)) &&
    (depto === "Todos" || (d.departamento ?? "Sin dato") === depto) &&
    (tam === "Todos" || d.tamano === tam) && d.duracion_h >= minDur
  ).sort((a, b) => (a.inicio < b.inicio ? 1 : -1)), [datos, anio, depto, tam, minDur]);

  const durs = f.map((d) => d.duracion_h).sort((a, b) => a - b);
  const mediana = durs.length ? durs[Math.floor(durs.length / 2)] : 0;
  const masLargo = f.reduce<Inc | null>((a, b) => (!a || b.duracion_h > a.duracion_h ? b : a), null);
  const porAnio = anios.map((a) => ({ etiqueta: String(a), valor: f.filter((d) => d.anio === a).length }));
  const porMes = (lang === "en" ? MESES_EN : MESES).map((n, i) => ({ etiqueta: n, valor: f.filter((d) => d.mes === i + 1).length }));
  const largos = f.filter((d) => d.duracion_h >= 24).length;

  function descargarCsv() {
    const cab = tr("ID,Inicio (hora local),Fin (hora local),Duracion observada (h),Dias con deteccion,Departamento,Latitud,Longitud,Detecciones,Celdas H3,FRP maximo (MW),Tamano,Prolongado", "ID,Start (local time),End (local time),Observed duration (h),Days with detection,Department,Latitude,Longitude,Detections,H3 cells,Max FRP (MW),Size,Prolonged");
    const filas = [...f].sort((a, b) => (a.inicio < b.inicio ? -1 : 1)).map((d) =>
      [d.incendio_id, fecha(d.inicio), fecha(d.fin), d.duracion_h, d.dias_activos, `"${d.departamento ?? ""}"`, d.lat.toFixed(4), d.lon.toFixed(4),
        d.n_focos, d.n_celdas, d.frp_max_mw ?? "", tamTxt(d.tamano), d.prolongado ? tr("si", "yes") : "no"].join(","));
    const blob = new Blob(["﻿" + [cab, ...filas].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "registro_incendios_catamarca.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="pagina">
      <h1 className="titulo">{tr("Registro de incendios", "Fire registry")}</h1>
      <p className="sub">{tr("Cada incendio agrupa las detecciones satelitales (MODIS + VIIRS) que estan a menos de 3 km y 48 h entre si. La duracion es la observada, de la primera a la ultima deteccion: es un minimo, porque el satelite pasa cada pocas horas y las nubes lo tapan. Solo detecciones de confianza nominal o alta.", "Each fire groups satellite detections (MODIS + VIIRS) within 3 km and 48 h of each other. Duration is the observed one, from the first to the last detection: it is a minimum, because the satellite passes every few hours and clouds block it. Only nominal or high confidence detections.")}</p>
      {error && <div className="msg">{error}</div>}

      <div className="filtro" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label>{tr("Año", "Year")}: <select value={anio} onChange={(e) => { setAnio(e.target.value); setLimite(100); }}><option value="Todos">{tr("Todos", "All")}</option>{anios.map((a) => <option key={a}>{a}</option>)}</select></label>
        <label>{tr("Departamento", "Department")}: <select value={depto} onChange={(e) => { setDepto(e.target.value); setLimite(100); }}><option value="Todos">{tr("Todos", "All")}</option>{deptos.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label>{tr("Tamaño", "Size")}: <select value={tam} onChange={(e) => { setTam(e.target.value); setLimite(100); }}>{["Todos", "puntual", "pequeno", "mediano", "grande"].map((t) => <option key={t} value={t}>{t === "Todos" ? tr("Todos", "All") : tamTxt(t)}</option>)}</select></label>
        <label>{tr("Duracion", "Duration")}: <select value={minDur} onChange={(e) => { setMinDur(Number(e.target.value)); setLimite(100); }}>{MIN_DUR.map((m) => <option key={m.label} value={m.horas}>{tr(m.label, m.en)}</option>)}</select></label>
      </div>

      <div className="kpis">
        <div className="kpi"><b>{num(f.length)}</b><span>{tr("incendios registrados", "fires recorded")}</span></div>
        <div className="kpi"><b>{duracion(mediana)}</b><span>{tr("duracion mediana observada", "median observed duration")}</span></div>
        <div className="kpi"><b>{num(largos)}</b><span>{tr("duraron un dia o mas", "lasted one day or more")}</span></div>
        <div className="kpi"><b>{masLargo ? duracion(masLargo.duracion_h) : tr("s/d", "n/a")}</b><span>{tr("el mas largo", "longest")}{masLargo ? ` (${fechaCorta(masLargo.inicio)})` : ""}</span></div>
      </div>

      <section className="card"><h2>{tr("Incendios por año", "Fires per year")}</h2><Barras datos={porAnio} /></section>
      <section className="card"><h2>{tr("Incendios por mes del año", "Fires per month of the year")}</h2><Barras datos={porMes} color="#fb923c" /></section>

      <section className="card">
        <h2>{tr("Registro", "Registry")}</h2>
        <p className="nota">{tr("Mas recientes primero.", "Most recent first.")} {f.length > limite ? tr(`Se muestran ${limite} de ${num(f.length)}; el CSV trae todos los filtrados.`, `Showing ${limite} of ${num(f.length)}; the CSV includes all filtered rows.`) : ""}</p>
        <button className="btn" onClick={descargarCsv} style={{ marginBottom: 8 }}>{tr("Descargar CSV", "Download CSV")} ({num(f.length)} {tr("filas", "rows")})</button>
        <div style={{ overflowX: "auto" }}>
          <table className="tabla">
            <thead><tr><th>ID</th><th>{tr("Cuando empezo", "Started")}</th><th>{tr("Cuando se vio por ultima vez", "Last seen")}</th><th>{tr("Duracion", "Duration")}</th><th>{tr("Donde", "Where")}</th><th>{tr("Detecciones", "Detections")}</th><th>{tr("Tamaño", "Size")}</th><th>FRP max</th></tr></thead>
            <tbody>{f.slice(0, limite).map((d) => (
              <tr key={d.incendio_id}>
                <td>{d.incendio_id}</td><td>{fecha(d.inicio)}</td><td>{fecha(d.fin)}</td>
                <td>{duracion(d.duracion_h)}{d.prolongado ? " *" : ""}</td>
                <td>{d.departamento ?? tr("s/d", "n/a")}{" "}<a href={`https://www.openstreetmap.org/?mlat=${d.lat}&mlon=${d.lon}#map=13/${d.lat}/${d.lon}`} target="_blank" rel="noreferrer">{d.lat.toFixed(3)}, {d.lon.toFixed(3)}</a></td>
                <td>{d.n_focos}</td><td>{tamTxt(d.tamano)}</td><td>{d.frp_max_mw != null ? `${d.frp_max_mw.toFixed(1)} MW` : tr("s/d", "n/a")}</td>
              </tr>))}</tbody>
          </table>
        </div>
        {f.length > limite && <button className="btn" style={{ marginTop: 8 }} onClick={() => setLimite(limite + 200)}>{tr("Mostrar mas", "Show more")}</button>}
        <p className="nota" style={{ marginTop: 8 }}>{tr("* Mas de 14 dias con detecciones: puede ser varios incendios encadenados o quemas recurrentes en la misma zona.", "* More than 14 days with detections: may be several chained fires or recurring burns in the same area.")}</p>
      </section>
      </div>
    </>
  );
}

export default function Registro() {
  return (
    <Shell activo="registro">
      <Contenido />
    </Shell>
  );
}
