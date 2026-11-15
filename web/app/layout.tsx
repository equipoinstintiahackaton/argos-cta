import type { ReactNode } from "react";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata = {
  title: "ARGOS | Alerta de Riesgo Geoespacial y Observacion Satelital",
  description: "Conocer para prevenir. Riesgo de incendios en Catamarca a 7 dias con datos satelitales MODIS, VIIRS y clima NASA POWER.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
