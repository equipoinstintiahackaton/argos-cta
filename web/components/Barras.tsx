"use client";

type Dato = { etiqueta: string; valor: number; destacado?: boolean };

/** Grafico de barras simple en SVG (sin dependencias). */
export default function Barras({ datos, color = "#f97316", alto = 170 }: { datos: Dato[]; color?: string; alto?: number }) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const ancho = 640;
  const margen = 22;
  const w = (ancho - margen * 2) / Math.max(1, datos.length);
  return (
    <svg viewBox={`0 0 ${ancho} ${alto + 34}`} width="100%" role="img">
      {datos.map((d, i) => {
        const h = (d.valor / max) * alto;
        const x = margen + i * w;
        return (
          <g key={d.etiqueta}>
            <rect x={x + 2} y={alto - h + 6} width={Math.max(2, w - 4)} height={h} rx={2} fill={d.destacado ? "#dc2626" : color}>
              <title>{`${d.etiqueta}: ${d.valor.toLocaleString("es-AR")}`}</title>
            </rect>
            <text x={x + w / 2} y={alto + 22} textAnchor="middle" fontSize={datos.length > 16 ? 8 : 10} fill="#9ca3af">
              {d.etiqueta}
            </text>
          </g>
        );
      })}
      <text x={margen} y={12} fontSize={10} fill="#9ca3af">{`max ${max.toLocaleString("es-AR")}`}</text>
    </svg>
  );
}
