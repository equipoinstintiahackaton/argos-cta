"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { infoBanda, BANDAS, nombreBanda } from "../lib/bandas";
import { useIdioma } from "../lib/i18n";
import { getSupabase } from "../lib/supabase";
import { contar, ultimoFoco } from "../lib/resumen";
import { fechaCorta, num } from "../lib/formato";

type R = { fecha: string; departamento: string; probabilidad: number; banda: string; n_celdas: number };
type Esc = { banda: string; orden: number; frecuencia_observada: number | null };

/** Curva suave (Catmull-Rom a Bezier) por los puntos dados en un lienzo 835 x 230. */
function curva(vals: number[], max: number) {
  const W = 835, H = 230, top = 40, bot = 190;
  const pts = vals.map((v, i) => [vals.length === 1 ? W / 2 : (i * W) / (vals.length - 1), bot - (v / max) * (bot - top)]);
  if (pts.length < 2) return { linea: "", area: "" };
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1].toFixed(1)}`;
  }
  return { linea: d, area: `${d} L${W},${H} L0,${H} Z` };
}

export default function Inicio() {
  const { tr, lang } = useIdioma();
  const [filas, setFilas] = useState<R[]>([]);
  const [esc, setEsc] = useState<Esc[]>([]);
  const [recientes, setRecientes] = useState<number | null>(null);
  const [ultimo, setUltimo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setError(tr("Falta la configuracion de Supabase.", "Supabase is not configured.")); return; }
    (async () => {
      const { data, error: e } = await sb.from("riesgo_depto").select("fecha,departamento,probabilidad,banda,n_celdas")
        .order("fecha", { ascending: false }).limit(16 * 14);
      if (e) { setError(e.message); return; }
      setFilas((data ?? []) as R[]);
      const { data: es } = await sb.from("escala_bandas").select("banda,orden,frecuencia_observada").order("orden");
      setEsc((es ?? []) as Esc[]);
      const u = await ultimoFoco();
      setUltimo(u);
      if (u) {
        const desde = new Date(new Date(u).getTime() - 3 * 86400000).toISOString();
        setRecientes(await contar("focos_vista", (q) => q.gte("ts_utc", desde)));
      }
    })();
  }, []);

  const { hoy, fechaHoy, serie, dias } = useMemo(() => {
    const fechas = Array.from(new Set(filas.map((f) => f.fecha))).sort();
    const fechaHoy = fechas[fechas.length - 1] ?? null;
    const hoy = filas.filter((f) => f.fecha === fechaHoy).sort((a, b) => b.probabilidad - a.probabilidad);
    const serie = fechas.map((f) => Math.max(...filas.filter((x) => x.fecha === f).map((x) => x.probabilidad)));
    return { hoy, fechaHoy, serie, dias: fechas };
  }, [filas]);

  if (error) return <div className="msg">{error}</div>;
  if (!hoy.length) return <p className="nota" style={{ padding: 20 }}>{tr("Cargando el estado de hoy...", "Loading today's status...")}</p>;

  const top = hoy[0];
  const b = infoBanda(top.banda);
  const bl = (id: string) => nombreBanda(id, lang);
  const pctTxt = (p: number) => (p > 0.9 ? tr("mas de 90", "over 90") : num(p * 100));
  const desactualizada = !!(fechaHoy && ultimo && (new Date(ultimo).getTime() - new Date(fechaHoy + "T00:00:00Z").getTime()) / 86400000 > 2);
  const max = Math.max(0.05, ...serie) * 1.1;
  const c = curva(serie, max);
  const etiquetas = dias.length > 6 ? dias.filter((_, i) => i % Math.ceil(dias.length / 6) === 0) : dias;
  const f = (s: string) => s.slice(8, 10) + "/" + s.slice(5, 7);

  return (
    <div className="gl-inicio">
      <section className="gl-hero">
        <span className="gl-chip">{tr("Centro de monitoreo", "Monitoring center")}</span>
        <h1>
          <span className="gl-ln"><span>{lang === "en" ? `${bl(top.banda)} risk` : `Riesgo ${b.label.toLowerCase()}`}</span></span>
          <span className="gl-ln"><span>{tr("en", "in")} {top.departamento}</span></span>
        </h1>
        <p className="gl-blurb">
          {tr("Es el departamento con mayor probabilidad estimada de al menos un foco en los proximos 7 dias", "It is the department with the highest estimated probability of at least one hotspot in the next 7 days")} ({pctTxt(top.probabilidad)}%).{" "}
          {tr("ARGOS es un prototipo de apoyo informativo: priorizar donde mirar no reemplaza los canales oficiales de emergencia.", "ARGOS is an informational support prototype: prioritizing where to look does not replace official emergency channels.")}
        </p>
        <div className="gl-botones">
          <Link href="/mapa" className="gl-btn">{tr("Ver el mapa", "View the map")}</Link>
          <Link href="/registro" className="gl-link">{tr("Registro de incendios", "Fire registry")}</Link>
        </div>
      </section>

      <section className="gl-forecast" aria-label={tr("Escala de alerta y evolucion de la probabilidad", "Alert scale and probability trend")}>
        <div className="gl-temps">
          {BANDAS.map((x, i) => {
            const e = esc.find((y) => y.banda === x.id);
            return (
              <div key={x.id} style={{ ["--d" as any]: `${1.26 + i * 0.07}s` }}>
                <b style={{ color: x.id === "negro" ? "#fff" : x.color }}>{bl(x.id)}</b>
                <small>{e?.frecuencia_observada != null ? `${num(e.frecuencia_observada * 100, 1)}% ${tr("observado", "observed")}` : `${x.desde} ${tr("a", "to")} ${x.hasta}`}</small>
              </div>
            );
          })}
        </div>
        {serie.length >= 5 && <svg viewBox="0 0 835 230" preserveAspectRatio="none" className="gl-chart" aria-hidden="true">
          <defs>
            <linearGradient id="wf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FF702E" stopOpacity=".42" /><stop offset="1" stopColor="#FF702E" stopOpacity="0" /></linearGradient>
          </defs>
          <path className="gl-fill" d={c.area} fill="url(#wf)" />
          <path className="gl-line" d={c.linea} fill="none" stroke="#FF813C" strokeWidth="3.4" pathLength={1} />
        </svg>}
        {serie.length >= 5 && <div className="gl-days">
          {etiquetas.map((d, i) => <span key={d} className={i === etiquetas.length - 1 ? "on" : ""}>{f(d)}</span>)}
        </div>}
        <p className="gl-cap">{tr("Escala de 7 niveles con la frecuencia de focos que se observo en cada uno, medida en datos que el modelo no vio. La probabilidad por departamento es una estimacion: sobre 90% se muestra como tope.", "7-level scale with the hotspot frequency observed at each level, measured on data the model did not see. Department probability is an estimate: above 90% is shown as a cap.")}</p>
      </section>

      <aside className="gl-rail">
        <div className="gl-card big">
          <span className="gl-place">{top.departamento}</span>
          <div className="gl-bigtemp" style={top.probabilidad > 0.9 ? { fontSize: 44, letterSpacing: -1 } : undefined}>{top.probabilidad > 0.9 ? ">90" : num(top.probabilidad * 100)}<i>%</i></div>
          <div className="gl-metrics">
            <div><b>{bl(top.banda)}</b><small>{tr("nivel", "level")}</small></div>
            <div><b>{num(top.n_celdas)}</b><small>{tr("celdas", "cells")}</small></div>
            <div><b>{recientes == null ? tr("s/d", "n/a") : num(recientes)}</b><small>{tr("focos 3 dias (provincia)", "hotspots 3 days (province)")}</small></div>
          </div>
        </div>
        {hoy.slice(1, 4).map((d) => {
          const bb = infoBanda(d.banda);
          return (
            <div key={d.departamento} className="gl-card row">
              <div><small>Catamarca</small><b>{d.departamento}</b><span style={{ color: bb.id === "negro" ? "#fff" : bb.color }}>{bl(bb.id)}</span></div>
              <div className="gl-t">{d.probabilidad > 0.9 ? ">90" : num(d.probabilidad * 100)}<i>%</i></div>
            </div>
          );
        })}
        {desactualizada && <p className="gl-warn">{tr("Prediccion desactualizada: el riesgo no se recalculo con los datos satelitales mas recientes.", "Outdated prediction: risk was not recalculated with the latest satellite data.")}</p>}
        <p className="gl-cap">{tr("Prediccion al", "Prediction as of")} {fechaHoy ? fechaCorta(fechaHoy + "T12:00:00Z") : tr("s/d", "n/a")}{ultimo ? `. ${tr("Ultimo foco recibido", "Latest hotspot received")}: ${fechaCorta(ultimo)}` : ""}.</p>
      </aside>
    </div>
  );
}
