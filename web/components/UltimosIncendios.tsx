"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";
import { duracion, fecha } from "../lib/formato";

type Inc = { incendio_id: number; inicio: string; duracion_h: number; departamento: string | null; tamano: string; n_focos: number; lat: number; lon: number };

export default function UltimosIncendios() {
  const [filas, setFilas] = useState<Inc[]>([]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.from("incendios").select("incendio_id,inicio,duracion_h,departamento,tamano,n_focos,lat,lon")
      .neq("tamano", "puntual").order("inicio", { ascending: false }).limit(8)
      .then(({ data }) => setFilas((data ?? []) as Inc[]));
  }, []);

  return (
    <>
      <p className="nota">Ultimos incendios que se extendieron mas de una celda o duraron varias detecciones. La duracion es la observada por satelite (un minimo).</p>
      <div style={{ overflowX: "auto" }}>
        <table className="tabla">
          <thead><tr><th>Cuando empezo</th><th>Duracion</th><th>Donde</th><th>Detecciones</th><th>Tamaño</th></tr></thead>
          <tbody>{filas.map((d) => (
            <tr key={d.incendio_id}><td>{fecha(d.inicio)}</td><td>{duracion(d.duracion_h)}</td>
              <td>{d.departamento ?? "s/d"} <a href={`https://www.openstreetmap.org/?mlat=${d.lat}&mlon=${d.lon}#map=13/${d.lat}/${d.lon}`} target="_blank" rel="noreferrer">{d.lat.toFixed(3)}, {d.lon.toFixed(3)}</a></td>
              <td>{d.n_focos}</td><td>{d.tamano}</td></tr>))}</tbody>
        </table>
      </div>
      <p className="nota" style={{ marginTop: 8 }}><Link href="/registro">Ver el registro completo con filtros y descarga CSV</Link></p>
    </>
  );
}
