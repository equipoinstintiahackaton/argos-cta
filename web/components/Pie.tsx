"use client";

import { useIdioma } from "../lib/i18n";

export default function Pie() {
  const { tr } = useIdioma();
  return (
    <footer className="pie">
      <img src="/logo-pie.png" alt={tr("Logo de ARGOS", "ARGOS logo")} />
      <strong>ARGOS</strong> | {tr("Alerta de Riesgo Geoespacial y Observacion Satelital", "Geospatial Risk Alert and Satellite Observation")}
      <br />Catamarca, Argentina | NASA Space Apps Challenge 2026
      <br />{tr("ARGOS es un prototipo de apoyo informativo y no reemplaza los canales oficiales de emergencia.", "ARGOS is an informational support prototype and does not replace official emergency channels.")}{" "}
      {tr("Los niveles de riesgo son estimaciones estadisticas y las detecciones satelitales son anomalias termicas, no incendios confirmados.", "Risk levels are statistical estimates and satellite detections are thermal anomalies, not confirmed fires.")}
    </footer>
  );
}
