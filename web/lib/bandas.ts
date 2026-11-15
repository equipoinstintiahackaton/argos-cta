export type Banda = "verde" | "amarillo" | "naranja" | "naranja_fuerte" | "rojo" | "marron" | "negro";

export const BANDAS: { id: Banda; label: string; color: string; opacidad: number; desde: number; hasta: number }[] = [
  { id: "verde", label: "Verde", color: "#22c55e", opacidad: 0.12, desde: 0, hasta: 20 },
  { id: "amarillo", label: "Amarillo", color: "#facc15", opacidad: 0.3, desde: 20, hasta: 35 },
  { id: "naranja", label: "Naranja", color: "#fb923c", opacidad: 0.45, desde: 35, hasta: 45 },
  { id: "naranja_fuerte", label: "Naranja fuerte", color: "#ea580c", opacidad: 0.55, desde: 45, hasta: 60 },
  { id: "rojo", label: "Rojo", color: "#dc2626", opacidad: 0.65, desde: 60, hasta: 75 },
  { id: "marron", label: "Marrón", color: "#7c2d12", opacidad: 0.75, desde: 75, hasta: 80 },
  { id: "negro", label: "Negro", color: "#000000", opacidad: 0.85, desde: 80, hasta: 100 },
];

const POR_ID = Object.fromEntries(BANDAS.map((b) => [b.id, b]));

export function infoBanda(id: string | null | undefined) {
  return (id && POR_ID[id]) || { id: "sin_dato", label: "Sin dato", color: "#6b7280", opacidad: 0.05, desde: 0, hasta: 0 };
}

const EN: Record<string, string> = { verde: "Green", amarillo: "Yellow", naranja: "Orange", naranja_fuerte: "Strong orange", rojo: "Red", marron: "Brown", negro: "Black", sin_dato: "No data" };
/** Nombre de la banda en el idioma pedido. */
export function nombreBanda(id: string | null | undefined, lang: "es" | "en") {
  return lang === "en" ? EN[id ?? "sin_dato"] ?? "No data" : infoBanda(id).label;
}
