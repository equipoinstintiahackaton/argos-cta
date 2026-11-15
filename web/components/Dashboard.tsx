"use client";

import { useEffect, useRef, useState } from "react";
import { cellToBoundary, cellToLatLng } from "h3-js";
import { BANDAS, infoBanda, nombreBanda } from "../lib/bandas";
import { useIdioma, motivo as motivoTr } from "../lib/i18n";
import { getSupabase } from "../lib/supabase";
import { traerTodo } from "../lib/datos";

type Riesgo = { h3_cell: string; probabilidad: number; indice: number | null; banda: string | null };
type Alerta = { h3_cell: string; banda: string | null; indice: number | null; probabilidad: number; motivo: string | null };
type Depto = { nombre: string; geojson: any };
type RDepto = { departamento: string; probabilidad: number; banda: string; n_celdas: number };
type FocoRec = { foco_id: number; lat: number; lon: number; ts_utc: string; hora_local: number | null; satelite: string; instrumento: string; frp_mw: number | null; confianza_cat: string };
type Escala = { banda: string; orden: number; frecuencia_observada: number | null; lift: number | null; frac_celdas_dia: number };

export default function Dashboard({ embebido = false }: { embebido?: boolean }) {
  const { tr, lang } = useIdioma();
  const bl = (id: string | null | undefined) => nombreBanda(id, lang);
  const mapaRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const capasRef = useRef<any[]>([]);
  const [fecha, setFecha] = useState<string | null>(null);
  const [fechas, setFechas] = useState<string[]>([]);
  const [ultimaFoco, setUltimaFoco] = useState<string | null>(null);
  const [focosRec, setFocosRec] = useState<FocoRec[]>([]);
  const [verFocos, setVerFocos] = useState(true);
  const focosRef = useRef<any>(null);
  const [riesgo, setRiesgo] = useState<Riesgo[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [deptos, setDeptos] = useState<Depto[]>([]);
  const [rdeptos, setRdeptos] = useState<RDepto[]>([]);
  const [escala, setEscala] = useState<Escala[]>([]);
  const [capa, setCapa] = useState<"celdas" | "deptos">("celdas");
  const [tab, setTab] = useState<"alertas" | "deptos">("alertas");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [panelAbierto, setPanelAbierto] = useState(true);

  // 1) Datos que no dependen de la fecha
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setError(tr("Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.", "Missing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.")); return; }
    (async () => {
      try {
        const { data: f, error: e1 } = await sb.from("riesgo_depto").select("fecha").order("fecha", { ascending: false }).limit(400);
        if (e1) throw e1;
        const lista = Array.from(new Set((f ?? []).map((x: any) => x.fecha as string)));
        if (lista.length === 0) { setError(tr("Todavia no hay predicciones cargadas en Supabase.", "No predictions loaded in Supabase yet.")); return; }
        setFechas(lista);
        setFecha(lista[0]);
        const [d, es, uf] = await Promise.all([
          sb.from("departamentos").select("nombre,geojson"),
          sb.from("escala_bandas").select("banda,orden,frecuencia_observada,lift,frac_celdas_dia").order("orden"),
          sb.from("focos_vista").select("ts_utc").order("ts_utc", { ascending: false }).limit(1),
        ]);
        setDeptos((d.data ?? []) as Depto[]);
        setEscala((es.data ?? []) as Escala[]);
        const ult = uf.data && uf.data.length ? (uf.data[0].ts_utc as string) : null;
        if (ult) {
          setUltimaFoco(ult.slice(0, 10));
          const desde = new Date(new Date(ult).getTime() - 3 * 86400000).toISOString();
          const { data: fr } = await sb.from("focos_vista")
            .select("foco_id,lat,lon,ts_utc,hora_local,satelite,instrumento,frp_mw,confianza_cat")
            .gte("ts_utc", desde).limit(1500);
          setFocosRec((fr ?? []) as FocoRec[]);
        }
      } catch (e: any) { setError(e?.message ?? tr("Error al leer Supabase", "Error reading Supabase")); }
    })();
  }, []);

  // 2) Datos de la fecha elegida
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !fecha) return;
    (async () => {
      try {
        const [r, a, rd] = await Promise.all([
          traerTodo<Riesgo>("riesgo", "h3_cell,probabilidad,indice,banda", [["fecha", fecha]]),
          sb.from("alertas").select("h3_cell,banda,indice,probabilidad,motivo").eq("fecha", fecha).order("indice", { ascending: false }).order("probabilidad", { ascending: false }).limit(40),
          sb.from("riesgo_depto").select("departamento,probabilidad,banda,n_celdas").eq("fecha", fecha).order("probabilidad", { ascending: false }),
        ]);
        setRiesgo(r);
        setAlertas((a.data ?? []) as Alerta[]);
        setRdeptos((rd.data ?? []) as RDepto[]);
      } catch (e: any) { setError(e?.message ?? tr("Error al leer Supabase", "Error reading Supabase")); }
    })();
  }, [fecha]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!vivo || !mapaRef.current || mapRef.current) return;
      const map = L.map(mapaRef.current, { zoomControl: false }).setView([-27.5, -66.9], 7);
      L.control.zoom({ position: "bottomleft" }).addTo(map);
      // Mapa base oscuro sin clave (Esri). Si fallan los mosaicos, se cae a OpenStreetMap oscurecido por CSS.
      const esri = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", { attribution: "Tiles &copy; Esri, HERE, Garmin, OpenStreetMap", maxZoom: 16 }).addTo(map);
      const etq = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, pane: "overlayPane" }).addTo(map);
      let fallos = 0;
      esri.on("tileerror", () => {
        if (++fallos < 6) return;
        esri.remove(); etq.remove();
        mapaRef.current?.classList.add("base-osm");
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap", maxZoom: 19 }).addTo(map);
      });
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
          }).bindPopup(`<b>${bl(r.banda)}</b><br/>${tr("Indice de riesgo", "Risk index")}: ${r.indice ?? tr("s/d", "n/a")}<br/>${tr("Probabilidad del modelo", "Model probability")}: ${(r.probabilidad * 100).toFixed(1)}%`).addTo(g);
        }
        g.addTo(map); capasRef.current.push(g);
      } else {
        const g = L.layerGroup();
        for (const d of deptos) {
          const r = porDepto[d.nombre];
          const b = infoBanda(r?.banda);
          L.geoJSON(d.geojson, { style: { color: "#cbd5e1", weight: 1.2, fillColor: b.color, fillOpacity: 0.55 } })
            .bindPopup(`<b>${d.nombre}</b><br/>${tr("Probabilidad de al menos un foco en 7 dias", "Probability of at least one hotspot in 7 days")}: ${r ? (r.probabilidad * 100).toFixed(0) + "%" : tr("s/d", "n/a")}<br/>${tr("Nivel", "Level")}: ${bl(r?.banda)}`)
            .addTo(g);
        }
        g.addTo(map); capasRef.current.push(g);
      }
      if (capa === "celdas" && deptos.length) {
        const c = L.layerGroup();
        for (const d of deptos) L.geoJSON(d.geojson, { style: { color: "#94a3b8", weight: 1.2, fill: false }, interactive: false }).addTo(c);
        c.addTo(map); capasRef.current.push(c);
      }
    })();
  }, [listo, riesgo, deptos, rdeptos, capa, lang]);

  // 4) Focos satelitales recientes
  useEffect(() => {
    if (!listo || !mapRef.current) return;
    (async () => {
      const L = (await import("leaflet")).default;
      if (focosRef.current) { focosRef.current.remove(); focosRef.current = null; }
      if (!verFocos || focosRec.length === 0) return;
      const g = L.layerGroup();
      for (const f of focosRec) {
        L.circleMarker([f.lat, f.lon], { radius: 5, color: "#FF702E", weight: 2, fillColor: "#ffffff", fillOpacity: 0.95 })
          .bindPopup(`<b>${tr("Foco satelital", "Satellite hotspot")}</b><br/>${f.ts_utc.slice(0, 16).replace("T", " ")} UTC<br/>${f.instrumento} (${f.satelite})<br/>${tr("Confianza", "Confidence")}: ${f.confianza_cat}<br/>FRP: ${f.frp_mw ?? tr("s/d", "n/a")} MW`)
          .addTo(g);
      }
      g.addTo(mapRef.current);
      focosRef.current = g;
    })();
  }, [listo, focosRec, verFocos, lang]);

  const esActual = !!(fecha && ultimaFoco && (new Date(ultimaFoco).getTime() - new Date(fecha).getTime()) / 86400000 <= 10);
  const conteo = (id: string) => riesgo.filter((r) => r.banda === id).length;
  const ir = (h3: string) => { const [la, lo] = cellToLatLng(h3); mapRef.current?.setView([la, lo], 10); };
  const pct = (x: number | null) => (x == null ? tr("s/d", "n/a") : (x * 100).toFixed(1) + "%");

  return (
    <div className={embebido ? "app embebido" : "app"}>
      <div className="mapawrap">
        <div ref={mapaRef} className="mapa" />
        <div className="capas">
          <button className={capa === "celdas" ? "on" : ""} onClick={() => setCapa("celdas")}>{tr("Celdas", "Cells")}</button>
          <button className={capa === "deptos" ? "on" : ""} onClick={() => setCapa("deptos")}>{tr("Departamentos", "Departments")}</button>
        </div>
        <button className={"panel-toggle" + (panelAbierto ? "" : " visible")} onClick={() => setPanelAbierto(true)}>{tr("Mostrar panel", "Show panel")}</button>
      </div>
      <aside className={"panel" + (panelAbierto ? "" : " cerrado")}>
        <button className="panel-cerrar" onClick={() => setPanelAbierto(false)}>{tr("Ocultar", "Hide")}</button>
        <div className="fechabar">
          <select value={fecha ?? ""} onChange={(e) => setFecha(e.target.value)}>
            {fechas.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <span className={esActual ? "etq actual" : "etq hist"}>{esActual ? tr("Situacion actual", "Current situation") : tr("Repeticion historica", "Historical replay")}</span>
        </div>
        <p className="sub">
          {tr("Riesgo de focos en los 7 dias siguientes a", "Hotspot risk for the 7 days after")} {fecha ?? "..."}.
          {esActual ? " " + tr("Calculado con datos satelitales hasta", "Computed with satellite data up to") + " " + ultimaFoco + "." : " " + tr("Es una repeticion de una fecha pasada, no el pronostico de hoy.", "This is a replay of a past date, not today's forecast.")}
        </p>
        {focosRec.length > 0 && (
          <label className="chk">
            <input type="checkbox" checked={verFocos} onChange={(e) => setVerFocos(e.target.checked)} />
            {" "}{tr("Mostrar focos satelitales de los ultimos 3 dias", "Show satellite hotspots from the last 3 days")} ({focosRec.length}, {tr("hasta", "up to")} {ultimaFoco})
          </label>
        )}
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
            ? tr("Indice 0-100: ordena el riesgo relativo de cada celda de ~36 km2. No es una probabilidad.", "Index 0-100: ranks the relative risk of each ~36 km2 cell. It is not a probability.")
            : tr("Probabilidad calibrada de que haya al menos un foco en el departamento en 7 dias.", "Calibrated probability of at least one hotspot in the department within 7 days.")}
        </p>

        <div className="tabs">
          <button className={tab === "alertas" ? "on" : ""} onClick={() => setTab("alertas")}>{tr("Alertas", "Alerts")} ({alertas.length})</button>
          <button className={tab === "deptos" ? "on" : ""} onClick={() => setTab("deptos")}>{tr("Departamentos", "Departments")}</button>
        </div>

        {tab === "alertas" && alertas.map((a) => {
          const b = infoBanda(a.banda);
          return (
            <div key={a.h3_cell} className="alerta" style={{ borderLeftColor: b.color }} onClick={() => ir(a.h3_cell)}>
              <div className="top"><span>{bl(a.banda).toUpperCase()}</span><span>{tr("indice", "index")} {a.indice ?? tr("s/d", "n/a")}</span></div>
              <div className="motivo">{motivoTr(a.motivo, lang).split("; ").slice(0, 2).join(". ")}</div>
            </div>
          );
        })}

        {tab === "deptos" && rdeptos.map((r) => {
          const b = infoBanda(r.banda);
          return (
            <div key={r.departamento} className="alerta" style={{ borderLeftColor: b.color }}>
              <div className="top"><span>{r.departamento}</span><span>{(r.probabilidad * 100).toFixed(0)}%</span></div>
              <div className="motivo">{bl(r.banda)}, {r.n_celdas} {tr("celdas", "cells")}</div>
            </div>
          );
        })}

        {escala.length > 0 && (
          <details>
            <summary>{tr("Que paso realmente en cada banda", "What actually happened in each band")}</summary>
            <table className="tabla">
              <thead><tr><th>{tr("Banda", "Band")}</th><th>{tr("Celdas-dia", "Cell-days")}</th><th>{tr("Con fuego en 7 d", "With fire in 7 d")}</th><th>{tr("x base", "x base")}</th></tr></thead>
              <tbody>
                {escala.map((e) => (
                  <tr key={e.banda}>
                    <td><i className="dot" style={{ background: infoBanda(e.banda).color }} />{bl(e.banda)}</td>
                    <td>{pct(e.frac_celdas_dia)}</td><td>{pct(e.frecuencia_observada)}</td><td>{e.lift ?? tr("s/d", "n/a")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="nota">{tr("Medido en datos que el modelo nunca vio (2024 en adelante).", "Measured on data the model never saw (2024 onward).")}</p>
          </details>
        )}

        <p className="aviso">
          {tr("ARGOS prioriza donde mirar, no predice incendios con certeza. La mayoria de las celdas alertadas no tendra fuego.", "ARGOS prioritizes where to look; it does not predict fires with certainty. Most alerted cells will not have fire.")}{" "}
          {tr("Datos", "Data")}: NASA FIRMS (MODIS {tr("y", "and")} VIIRS).
        </p>
      </aside>
    </div>
  );
}
