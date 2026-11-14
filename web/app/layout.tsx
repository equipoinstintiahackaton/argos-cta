import type { ReactNode } from "react";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata = {
  title: "ARGOS | Alerta temprana de incendios, Catamarca",
  description: "Prioriza donde mirar: riesgo de focos de calor a 7 dias por celda de ~36 km2.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
