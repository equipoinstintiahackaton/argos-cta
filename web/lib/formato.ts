export const TZ = "America/Argentina/Catamarca";

export const fecha = (s: string) =>
  new Date(s).toLocaleString("es-AR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const fechaCorta = (s: string) =>
  new Date(s).toLocaleDateString("es-AR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });

export function duracion(h: number) {
  if (h < 0.05) return "puntual (1 pasada)";
  if (h < 24) return `${Math.round(h)} h`;
  const d = Math.floor(h / 24), r = Math.round(h - d * 24);
  return r ? `${d} d ${r} h` : `${d} d`;
}

export const num = (x: number | null | undefined, d = 0) => (x == null ? "s/d" : x.toLocaleString("es-AR", { maximumFractionDigits: d, minimumFractionDigits: d }));
