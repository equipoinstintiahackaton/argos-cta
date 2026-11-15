export const TZ = "America/Argentina/Catamarca";

/** Idioma de formato (lo fija el proveedor de idioma). */
let LOC = "es-AR";
export const setLoc = (l: string) => { LOC = l; };

export const fecha = (s: string) =>
  new Date(s).toLocaleString(LOC, { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const fechaCorta = (s: string) =>
  new Date(s).toLocaleDateString(LOC, { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });

export function duracion(h: number) {
  if (h < 0.05) return LOC === "en-US" ? "single pass" : "puntual (1 pasada)";
  if (h < 24) return `${Math.round(h)} h`;
  const d = Math.floor(h / 24), r = Math.round(h - d * 24);
  return r ? `${d} ${LOC === "en-US" ? "d" : "d"} ${r} h` : `${d} d`;
}

export const num = (x: number | null | undefined, d = 0) => (x == null ? (LOC === "en-US" ? "n/a" : "s/d") : x.toLocaleString(LOC, { maximumFractionDigits: d, minimumFractionDigits: d }));
