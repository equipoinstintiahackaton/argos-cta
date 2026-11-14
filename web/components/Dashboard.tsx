"use client";

import { useEffect, useRef, useState } from "react";
import { cellToBoundary, cellToLatLng } from "h3-js";
import { getSupabase } from "../lib/supabase";

type Nivel = "bajo" | "medio" | "alto" | "critico";
type Riesgo = { h3_cell: string; probabilidad: number; nivel: Nivel };
type Alerta = { h3_cell: string; nivel: Nivel; probabilidad: number; motivo: string | null };

const COLOR: Record<Nivel, string> = {
  bajo: "#6b7280",
  medio: "#facc15",
  alto: "#f97316",
  critico: "#dc2626",
};

async function traerTodo(fecha: string): Promise<Riesgo[]> {
  const sb = getSupabase()!;
  const out: Riesgo[] = [];
  const paso = 1000; // limite por pedido de Supabase
  for (let desde = 0; ; desde += paso) {
    const { data, error } = await sb
      .from("riesgo")
      .select("h3_cell,probabilidad,nivel")
      .eq("fecha", fecha)
      .range(desde, desde + paso - 1);
    if (error) throw error;
    out.push(...((data ?? []) as Riesgo[]));
    if (!data || data.length < paso) break;
  }
  return out;
}

export default function Dashboard() {
  const mapaRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const capaRef = useRef<any>(null);
  const [fecha, setFecha] = useState<string | null>(null);
  const [riesgo, setRiesgo] = useState<Riesgo[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  // 1) Datos
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setError("Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    (async () => {
      try {
        const { data: f, error: e1 } = await sb
          .from("riesgo").select("fecha").order("fecha", { ascending: false }).limit(1);
        if (e1) throw e1;
        if (!f || f.length === 0) {
          setError("Todavia no hay predicciones cargadas en Supabase.");
          return;
        }
        const fe = f[0].fecha as string;
        setFecha(fe);
        setRiesgo(await traerTodo(fe));
        const { data: a, error: e2 } = await sb
          .from("alertas")
          .select("h3_cell,nivel,probabilidad,motivo")
          .eq("fecha", fe)
          .order("probabilidad", { ascending: false })
          .limit(40);
        if (e2) throw e2;
        setAlertas((a ?? []) as Alerta[]);
      } catch (e: any) {
        setError(e?.message ?? "Error al leer Supabase");
      }
    })();
  }, []);

  // 2) Mapa
  useEffect(() => {
    let vivo = true;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!vivo || !mapaRef.current || mapRef.current) return;
      const map = L.map(mapaRef.current).setView([-27.5, -66.9], 7);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);
      mapRef.current = map;
      setListo(true);
    })();
    return () => {
      vivo = false;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // 3) Dibujar celdas
  useEffect(() => {
    if (!listo || !mapRef.current || riesgo.length === 0) return;
    (async () => {
      const L = (await import("leaflet")).default;
      if (capaRef.current) capaRef.current.remove();
      const grupo = L.layerGroup();
      for (const r of riesgo) {
        const poli = cellToBoundary(r.h3_cell) as [number, number][];
        L.polygon(poli, {
          color: COLOR[r.nivel],
          weight: r.nivel === "bajo" ? 0.3 : 1,
          fillColor: COLOR[r.nivel],
          fillOpacity: r.nivel === "bajo" ? 0.05 : r.nivel === "medio" ? 0.25 : 0.5,
        })
          .bindPopup(`<b>${r.nivel.toUpperCase()}</b><br/>Probabilidad: ${(r.probabilidad * 100).toFixed(1)}%`)
          .addTo(grupo);
      }
      grupo.addTo(mapRef.current);
      capaRef.current = grupo;
    })();
  }, [listo, riesgo]);

  const conteo = (n: Nivel) => riesgo.filter((r) => r.nivel === n).length;

  function ir(h3: string) {
    const [lat, lon] = cellToLatLng(h3);
    mapRef.current?.setView([lat, lon], 10);
  }

  return (
    <div className="app">
      <div ref={mapaRef} className="mapa" />
      <aside className="panel">
        <h1>ARGOS</h1>
        <p className="sub">Riesgo de focos de calor en los proximos 7 dias{fecha ? `, desde ${fecha}` : ""}</p>
        {error && <div className="msg">{error}</div>}
        <div className="resumen">
          {(["bajo", "medio", "alto", "critico"] as Nivel[]).map((n) => (
            <div key={n} className="chip" style={{ background: COLOR[n] }}>
              <b>{conteo(n)}</b>{n}
            </div>
          ))}
        </div>
        <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>Alertas (mayor probabilidad)</h3>
        {alertas.map((a) => (
          <div key={a.h3_cell} className="alerta" style={{ borderLeftColor: COLOR[a.nivel] }} onClick={() => ir(a.h3_cell)}>
            <div className="top">
              <span>{a.nivel.toUpperCase()}</span>
              <span>{(a.probabilidad * 100).toFixed(1)}%</span>
            </div>
            <div className="motivo">{a.motivo}</div>
          </div>
        ))}
        <p className="aviso">
          ARGOS prioriza donde mirar, no predice incendios con certeza. Las celdas son de ~36 km2.
          Las alertas altas y criticas concentran la mayor parte de los focos reales, pero la
          mayoria de las celdas alertadas no tendra fuego. Datos: NASA FIRMS (MODIS y VIIRS).
        </p>
      </aside>
    </div>
  );
}
