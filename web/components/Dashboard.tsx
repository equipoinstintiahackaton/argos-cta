"use client";

import { useEffect, useRef, useState } from "react";
import { cellToBoundary, cellToLatLng } from "h3-js";
import Nav from "./Nav";
import { BANDAS, infoBanda } from "../lib/bandas";
import { getSupabase } from "../lib/supabase";
import { traerTodo } from "../lib/datos";

type Riesgo = { h3_cell: string; probabilidad: number; indice: number | null; banda: string | null };
type Alerta = { h3_cell: string; banda: string | null; indice: number | null; probabilidad: number; motivo: string | null };
type Depto = { nombre: string; geojson: any };
type RDepto = { departamento: string; probabilidad: number; banda: string; n_celdas: number };
type Escala = { banda: string; orden: number; frecuencia_observada: number | null; lift: number | null; frac_celdas_dia: number };

export default function Dashboard() {
  const mapaRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const capasRef = useRef<any[]>([]);
  const [fecha, setFecha] = useState<string | null>(null);
  const [riesgo, setRiesgo] = useState<Riesgo[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [deptos, setDeptos] = useState<Depto[]>([]);
  const [rdeptos, setRdeptos] = useState<RDepto[]>([]);
  const [escala, setEscala] = useState<Escala[]>([]);
  const [capa, setCapa] = useState<"celdas" | "deptos">("celdas");
  const [tab, setTab] = useState<"alertas" | "deptos">("alertas");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setError("Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY."); return; }
    (async () => {
      try {
        const { data: f, error: e1 } = await sb.from("riesgo").select("fecha").order("fecha", { ascending: false }).limit(1);
        if (e1) throw e1;
        if (!f || f.length === 0) { setError("Todavia no hay predicciones cargadas en Supabase."); return; }
        const fe = f[0].fecha as string;
        setFecha(fe);
        const [r, a, d, rd, es] = await Promise.all([
          traerTodo<Riesgo>("riesgo", "h3_cell,probabilidad,indice,banda", [["fecha", fe]]),
          sb.from("alertas").select("h3_cell,banda,indice,probabilidad,motivo").eq("fecha", fe).order("indice", { ascending: false }).limit(40),
          sb.from("departamentos").select("nombre,geojson"),
          sb.from("riesgo_depto").select("departamento,probabilidad,banda,n_celdas").eq("fecha", fe).order("probabilidad", { ascending: false }),
          sb.from("escala_bandas").select("banda,orden,frecuencia_observada,lift,frac_celdas_dia").order("orden"),
        ]);
        setRiesgo(r);
        setAlertas((a.data ?? []) as Alerta[]);
        setDeptos((d.data ?? []) as Depto[]);
        setRdeptos((rd.data ?? []) as RDepto[]);
        setEscala((es.data ?? []) as Escala[]);
      } catch (e: any) {
        setError(e?.message ?? "Error al leer Supabase");
      }
    })();
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!vivo || !mapaRef.current || mapRef.current) return;
      const map = L.map(mapaRef.current).setView([-27.5, -66.9], 7);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(map);
      mapRef.current = map;
      setListo(true);
    })();
    return () => { vivo = false; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []);

  useEffect(() => {
    if (!listo || !mapRef.current || riesgo.length === 0) return;
    (async () => {
      const L = (await import("leaflet")).default;
      capasRef.current.forEach((c) => c.remove());
      capasRef.current = [];
      const map = mapRef.current;
      const porDepto = Object.fromEntries(rdeptos.map((r) => [r.departamento, r]));

      if (capa === "celdas") {
        const g = L.layerGroup();
        for (const r of riesgo) {
          const b = infoBanda(r.banda);
          L.polygon(cellToBoundary(r.h3_cell) as [number, number][], {
            color: b.color, weight: r.banda === "verde" ? 0.3 : 1, fillColor: b.color, fillOpacity: b.opacidad,
          }).bindPopup(`<b>${b.label}</b><br/>Indice de riesgo: ${r.indice ?? "s/d"}<br/>Probabilidad del modelo: ${(r.probabilidad * 100).toFixed(1)}%`).addTo(g);
        }
        g.addTo(map); capasRef.current.push(g);
      } else {
        const g = L.layerGroup();
        for (const d of deptos) {
          const r = porDepto[d.nombre];
          const b = infoBanda(r?.banda);
          L.geoJSON(d.geojson, { style: { color: "#111827", weight: 1.2, fillColor: b.color, fillOpacity: 0.55 } })
            .bindPopup(`<b>${d.nombre}</b><br/>Probabilidad de al menos un foco en 7 dias: ${r ? (r.probabilidad * 100).toFixed(0) + "%" : "s/d"}<br/>Nivel: ${b.label}`)
            .addTo(g);
        }
        g.addTo(map); capasRef.current.push(g);
      }
      if (capa === "celdas" && deptos.length) {
        const c = L.layerGroup();
        for (const d of deptos) L.geoJSON(d.geojson, { style: { color: "#334155", weight: 1.2, fill: false }, interactive: false }).addTo(c);
        c.addTo(map); capasRef.current.push(c);
      }
    })();
  }, [listo, riesgo, deptos, rdeptos, capa]);

  const conteo = (id: string) => riesgo.filter((r) => r.banda === id).length;
  const ir = (h3: string) => { const [la, lo] = cellToLatLng(h3); mapRef.current?.setView([la, lo], 10); };
  const pct = (x: number | null) => (x == null ? "s/d" : (x * 100).toFixed(1) + "%");

  return (
    <div className="app">
      <div className="mapawrap">
        <div ref={mapaRef} className="mapa" />
        <div className="capas">
          <button className={capa === "celdas" ? "on" : ""} onClick={() => setCapa("celdas")}>Celdas (indice)</button>
          <button className={capa === "deptos" ? "on" : ""} onClick={() => setCapa("deptos")}>Departamentos (probabilidad)</button>
        </div>
      </div>
      <aside className="panel">
        <Nav activo="mapa" />
        <p className="sub">Repeticion historica: riesgo de focos en los 7 dias siguientes a {fecha ?? "..."}. No es el pronostico de hoy.</p>
        {error && <div className="msg">{error}</div>}

        <div className="leyenda">
          {BANDAS.map((b) => (
            <div key={b.id} className="lchip" style={{ background: b.color, color: b.id === "amarillo" ? "#111" : "#fff" }}>
              <b>{capa === "celdas" ? conteo(b.id) : rdeptos.filter((r) => r.banda === b.id).length}</b>
              <span>{b.desde}-{b.hasta}</span>
            </div>
          ))}
        </div>
        <p className="nota">
          {capa === "celdas"
            ? "Indice 0-100: ordena el riesgo relativo de cada celda de ~36 km2. No es una probabilidad."
            : "Probabilidad calibrada de que haya al menos un foco en el departamento en 7 dias."}
        </p>

        <div className="tabs">
          <button className={tab === "alertas" ? "on" : ""} onClick={() => setTab("alertas")}>Alertas ({alertas.length})</button>
          <button className={tab === "deptos" ? "on" : ""} onClick={() => setTab("deptos")}>Departamentos</button>
        </div>

        {tab === "alertas" && alertas.map((a) => {
          const b = infoBanda(a.banda);
          return (
            <div key={a.h3_cell} className="alerta" style={{ borderLeftColor: b.color }} onClick={() => ir(a.h3_cell)}>
              <div className="top"><span>{b.label.toUpperCase()}</span><span>indice {a.indice ?? "s/d"}</span></div>
              <div className="motivo">{a.motivo}</div>
            </div>
          );
        })}

        {tab === "deptos" && rdeptos.map((r) => {
          const b = infoBanda(r.banda);
          return (
            <div key={r.departamento} className="alerta" style={{ borderLeftColor: b.color }}>
              <div className="top"><span>{r.departamento}</span><span>{(r.probabilidad * 100).toFixed(0)}%</span></div>
              <div className="motivo">{b.label}, {r.n_celdas} celdas</div>
            </div>
          );
        })}

        {escala.length > 0 && (
          <>
            <h3 className="h3">Que paso realmente en cada banda</h3>
            <table className="tabla">
              <thead><tr><th>Banda</th><th>Celdas-dia</th><th>Con fuego en 7 d</th><th>x base</th></tr></thead>
              <tbody>
                {escala.map((e) => (
                  <tr key={e.banda}>
                    <td><i className="dot" style={{ background: infoBanda(e.banda).color }} />{infoBanda(e.banda).label}</td>
                    <td>{pct(e.frac_celdas_dia)}</td><td>{pct(e.frecuencia_observada)}</td><td>{e.lift ?? "s/d"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="nota">Medido en datos que el modelo nunca vio (2024 en adelante).</p>
          </>
        )}

        <p className="aviso">
          ARGOS prioriza donde mirar, no predice incendios con certeza. La mayoria de las celdas alertadas no tendra fuego.
          Datos: NASA FIRMS (MODIS y VIIRS).
        </p>
      </aside>
    </div>
  );
}
