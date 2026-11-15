"use client";

import { useEffect, useMemo, useState } from "react";
import Nav from "../../components/Nav";
import Barras from "../../components/Barras";
import { traerTodo } from "../../lib/datos";

type Inc = {
  incendio_id: number; inicio: string; fin: string; duracion_h: number; dias_activos: number;
  n_focos: number; n_celdas: number; lat: number; lon: number; departamento: string | null;
  frp_max_mw: number | null; frp_total_mw: number | null; tamano: string; prolongado: boolean; anio: number; mes: number;
};

const TZ = "America/Argentina/Catamarca";
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const fecha = (s: string) => new Date(s).toLocaleString("es-AR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fechaCorta = (s: string) => new Date(s).toLocaleDateString("es-AR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });

function duracion(h: number) {
  if (h < 0.05) return "puntual (1 pasada)";
  if (h < 24) return `${Math.round(h)} h`;
  const d = Math.floor(h / 24), r = Math.round(h - d * 24);
  return r ? `${d} d ${r} h` : `${d} d`;
}

const MIN_DUR: { label: string; horas: number }[] = [
  { label: "Cualquiera", horas: -1 }, { label: "Mas de 1 pasada", horas: 0.05 },
  { label: "12 h o mas", horas: 12 }, { label: "1 dia o mas", horas: 24 }, { label: "3 dias o mas", horas: 72 }, { label: "7 dias o mas", horas: 168 },
];

export default function Registro() {
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
      } catch (e: any) { setError(e?.message ?? "Error al leer Supabase"); }
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
  const porMes = MESES.map((n, i) => ({ etiqueta: n, valor: f.filter((d) => d.mes === i + 1).length }));
  const largos = f.filter((d) => d.duracion_h >= 24).length;

  function descargarCsv() {
    const cab = "ID,Inicio (hora local),Fin (hora local),Duracion observada (h),Dias con deteccion,Departamento,Latitud,Longitud,Detecciones,Celdas H3,FRP maximo (MW),Tamano,Prolongado";
    const filas = [...f].sort((a, b) => (a.inicio < b.inicio ? -1 : 1)).map((d) =>
      [d.incendio_id, fecha(d.inicio), fecha(d.fin), d.duracion_h, d.dias_activos, `"${d.departamento ?? ""}"`, d.lat.toFixed(4), d.lon.toFixed(4),
        d.n_focos, d.n_celdas, d.frp_max_mw ?? "", d.tamano, d.prolongado ? "si" : "no"].join(","));
    const blob = new Blob(["﻿" + [cab, ...filas].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "registro_incendios_catamarca.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="pagina">
      <Nav activo="registro" />
      <h1 className="titulo">Registro de incendios</h1>
      <p className="sub">Cada incendio agrupa las detecciones satelitales (MODIS + VIIRS) que estan a menos de 3 km y 48 h entre si. La duracion es la observada, de la primera a la ultima deteccion: es un minimo, porque el satelite pasa cada pocas horas y las nubes lo tapan. Solo detecciones de confianza nominal o alta.</p>
      {error && <div className="msg">{error}</div>}

      <div className="filtro" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label>Año: <select value={anio} onChange={(e) => { setAnio(e.target.value); setLimite(100); }}><option>Todos</option>{anios.map((a) => <option key={a}>{a}</option>)}</select></label>
        <label>Departamento: <select value={depto} onChange={(e) => { setDepto(e.target.value); setLimite(100); }}><option>Todos</option>{deptos.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label>Tamaño: <select value={tam} onChange={(e) => { setTam(e.target.value); setLimite(100); }}>{["Todos", "puntual", "pequeno", "mediano", "grande"].map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>Duracion: <select value={minDur} onChange={(e) => { setMinDur(Number(e.target.value)); setLimite(100); }}>{MIN_DUR.map((m) => <option key={m.label} value={m.horas}>{m.label}</option>)}</select></label>
      </div>

      <div className="kpis">
        <div className="kpi"><b>{f.length.toLocaleString("es-AR")}</b><span>incendios registrados</span></div>
        <div className="kpi"><b>{duracion(mediana)}</b><span>duracion mediana observada</span></div>
        <div className="kpi"><b>{largos.toLocaleString("es-AR")}</b><span>duraron un dia o mas</span></div>
        <div className="kpi"><b>{masLargo ? duracion(masLargo.duracion_h) : "s/d"}</b><span>el mas largo{masLargo ? ` (${fechaCorta(masLargo.inicio)})` : ""}</span></div>
      </div>

      <section className="card"><h2>Incendios por año</h2><Barras datos={porAnio} /></section>
      <section className="card"><h2>Incendios por mes del año</h2><Barras datos={porMes} color="#fb923c" /></section>

      <section className="card">
        <h2>Registro</h2>
        <p className="nota">Mas recientes primero. {f.length > limite ? `Se muestran ${limite} de ${f.length.toLocaleString("es-AR")}; el CSV trae todos los filtrados.` : ""}</p>
        <button className="btn" onClick={descargarCsv} style={{ marginBottom: 8 }}>Descargar CSV ({f.length.toLocaleString("es-AR")} filas)</button>
        <div style={{ overflowX: "auto" }}>
          <table className="tabla">
            <thead><tr><th>ID</th><th>Cuando empezo</th><th>Cuando se vio por ultima vez</th><th>Duracion</th><th>Donde</th><th>Detecciones</th><th>Tamaño</th><th>FRP max</th></tr></thead>
            <tbody>{f.slice(0, limite).map((d) => (
              <tr key={d.incendio_id}>
                <td>{d.incendio_id}</td><td>{fecha(d.inicio)}</td><td>{fecha(d.fin)}</td>
                <td>{duracion(d.duracion_h)}{d.prolongado ? " *" : ""}</td>
                <td>{d.departamento ?? "s/d"}{" "}<a href={`https://www.openstreetmap.org/?mlat=${d.lat}&mlon=${d.lon}#map=13/${d.lat}/${d.lon}`} target="_blank" rel="noreferrer">{d.lat.toFixed(3)}, {d.lon.toFixed(3)}</a></td>
                <td>{d.n_focos}</td><td>{d.tamano}</td><td>{d.frp_max_mw != null ? `${d.frp_max_mw.toFixed(1)} MW` : "s/d"}</td>
              </tr>))}</tbody>
          </table>
        </div>
        {f.length > limite && <button className="btn" style={{ marginTop: 8 }} onClick={() => setLimite(limite + 200)}>Mostrar mas</button>}
        <p className="nota" style={{ marginTop: 8 }}>* Mas de 14 dias con detecciones: puede ser varios incendios encadenados o quemas recurrentes en la misma zona.</p>
      </section>
    </div>
  );
}
