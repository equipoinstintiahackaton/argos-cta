"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";
import { duracion, fecha } from "../lib/formato";
import { useIdioma } from "../lib/i18n";

type Inc = { incendio_id: number; inicio: string; duracion_h: number; departamento: string | null; tamano: string; n_focos: number; lat: number; lon: number };

const TAM_EN: Record<string, string> = { puntual: "single detection", pequeno: "small", pequeño: "small", mediano: "medium", grande: "large" };

export default function UltimosIncendios() {
  const [filas, setFilas] = useState<Inc[]>([]);
  const { tr, lang } = useIdioma();

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.from("incendios").select("incendio_id,inicio,duracion_h,departamento,tamano,n_focos,lat,lon")
      .neq("tamano", "puntual").order("inicio", { ascending: false }).limit(8)
      .then(({ data }) => setFilas((data ?? []) as Inc[]));
  }, []);

  return (
    <>
      <p className="nota">{tr("Últimos incendios que se extendieron más de una celda o duraron varias detecciones. La duración es la observada por satélite (un mínimo).", "Latest fires that spread over more than one cell or lasted several detections. Duration is what the satellite observed (a minimum).")}</p>
      <div style={{ overflowX: "auto" }}>
        <table className="tabla">
          <thead><tr><th>{tr("Cuándo empezó", "Started")}</th><th>{tr("Duración", "Duration")}</th><th>{tr("Dónde", "Where")}</th><th>{tr("Detecciones", "Detections")}</th><th>{tr("Tamaño", "Size")}</th></tr></thead>
          <tbody>{filas.map((d) => (
            <tr key={d.incendio_id}><td>{fecha(d.inicio)}</td><td>{duracion(d.duracion_h)}</td>
              <td>{d.departamento ?? tr("s/d", "n/a")} <a href={`https://www.openstreetmap.org/?mlat=${d.lat}&mlon=${d.lon}#map=13/${d.lat}/${d.lon}`} target="_blank" rel="noreferrer">{d.lat.toFixed(3)}, {d.lon.toFixed(3)}</a></td>
              <td>{d.n_focos}</td><td>{lang === "en" ? TAM_EN[d.tamano] ?? d.tamano : d.tamano}</td></tr>))}</tbody>
        </table>
      </div>
      <p className="nota" style={{ marginTop: 8 }}><Link href="/registro">{tr("Ver el registro completo con filtros y descarga CSV", "See the full registry with filters and CSV download")}</Link></p>
    </>
  );
}
