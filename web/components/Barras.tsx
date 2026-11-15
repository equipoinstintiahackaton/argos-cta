"use client";

import { useEffect, useState } from "react";
import { useIdioma } from "../lib/i18n";

type Dato = { etiqueta: string; valor: number; destacado?: boolean };

/** Barras sin dependencias. Con muchas etiquetas largas (departamentos) pasa a barras horizontales; si no, SVG vertical
 *  que se ajusta al ancho de pantalla y saltea etiquetas cuando no entran. */
export default function Barras({ datos, color = "#FF702E", alto = 170 }: { datos: Dato[]; color?: string; alto?: number }) {
  const { lang } = useIdioma();
  const loc = lang === "en" ? "en-US" : "es-AR";
  const [chico, setChico] = useState(false);
  useEffect(() => {
    const f = () => setChico(window.innerWidth < 640);
    f(); window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  const max = Math.max(1, ...datos.map((d) => d.valor));
  const largas = datos.length > 8 && datos.some((d) => d.etiqueta.length > 4);

  if (largas) {
    return (
      <div className="hbarras" role="img">
        <div className="hb-max">{`max ${max.toLocaleString(loc)}`}</div>
        {datos.map((d) => (
          <div key={d.etiqueta} className="hb-fila">
            <span className="hb-et">{d.etiqueta}</span>
            <span className="hb-pista"><i style={{ width: `${Math.max(1, (d.valor / max) * 100)}%`, background: d.destacado ? "#FFFFFF" : color }} /></span>
            <span className="hb-val">{d.valor.toLocaleString(loc)}</span>
          </div>
        ))}
      </div>
    );
  }

  const ancho = chico ? 340 : 640;
  const margen = 12;
  const w = (ancho - margen * 2) / Math.max(1, datos.length);
  const salto = Math.max(1, Math.ceil(16 / w));
  return (
    <svg viewBox={`0 0 ${ancho} ${alto + 40}`} width="100%" role="img">
      <text x={ancho - margen} y={12} textAnchor="end" fontSize={10} fill="#AEB6BD">{`max ${max.toLocaleString(loc)}`}</text>
      {datos.map((d, i) => {
        const h = (d.valor / max) * alto;
        const x = margen + i * w;
        return (
          <g key={d.etiqueta}>
            <rect x={x + 1.5} y={alto - h + 20} width={Math.max(2, w - 3)} height={h} rx={2} fill={d.destacado ? "#FFFFFF" : color}>
              <title>{`${d.etiqueta}: ${d.valor.toLocaleString(loc)}`}</title>
            </rect>
            {i % salto === 0 && <text x={x + w / 2} y={alto + 36} textAnchor="middle" fontSize={10} fill="#AEB6BD">{d.etiqueta}</text>}
          </g>
        );
      })}
    </svg>
  );
}
