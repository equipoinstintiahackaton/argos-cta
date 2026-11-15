"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { setLoc } from "./formato";

export type Lang = "es" | "en";
type Ctx = { lang: Lang; setLang: (l: Lang) => void; tr: <T,>(es: T, en: T) => T };

const Contexto = createContext<Ctx>({ lang: "es", setLang: () => {}, tr: (es) => es });
const CLAVE = "argos-idioma";

export function IdiomaProvider({ children }: { children: ReactNode }) {
  const [lang, setLangEstado] = useState<Lang>("es");

  // Idioma guardado, o el del navegador si es la primera visita.
  useEffect(() => {
    try {
      const g = localStorage.getItem(CLAVE);
      if (g === "es" || g === "en") { setLangEstado(g); return; }
      if (!navigator.language.toLowerCase().startsWith("es")) setLangEstado("en");
    } catch { /* sin storage */ }
  }, []);

  setLoc(lang === "en" ? "en-US" : "es-AR");
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangEstado(l);
    try { localStorage.setItem(CLAVE, l); } catch { /* sin storage */ }
  }, []);
  const tr = useCallback(<T,>(es: T, en: T): T => (lang === "en" ? en : es), [lang]);
  const valor = useMemo(() => ({ lang, setLang, tr }), [lang, setLang, tr]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useIdioma = () => useContext(Contexto);

/** Traduce los motivos de alerta que genera el pipeline (siempre en español) cuando el idioma es ingles. */
const MOTIVOS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^zona con historial frecuente de focos$/, () => "area with a frequent fire history"],
  [/^(\d+) focos en la celda en 90 dias$/, (m) => `${m[1]} hotspots in the cell in 90 days`],
  [/^(\d+) focos en la celda en 30 dias$/, (m) => `${m[1]} hotspots in the cell in 30 days`],
  [/^(\d+) focos en la celda esta semana$/, (m) => `${m[1]} hotspots in the cell this week`],
  [/^(\d+) focos en celdas vecinas esta semana$/, (m) => `${m[1]} hotspots in neighboring cells this week`],
  [/^epoca del anio de mayor actividad de fuego$/, () => "time of year with the highest fire activity"],
  [/^(\d+) dias sin lluvia$/, (m) => `${m[1]} days without rain`],
  [/^poca lluvia acumulada \((\d+) mm en (\d+) dias\)$/, (m) => `low accumulated rainfall (${m[1]} mm in ${m[2]} days)`],
  [/^sin lluvia reciente$/, () => "no recent rain"],
  [/^humedad relativa de (\d+)%$/, (m) => `relative humidity of ${m[1]}%`],
  [/^humedad media semanal de (\d+)%$/, (m) => `weekly mean humidity of ${m[1]}%`],
  [/^humedad ([+-]?\d+) puntos respecto de lo normal$/, (m) => `humidity ${m[1]} points vs normal`],
  [/^aire muy seco \(VPD ([\d.]+) kPa\)$/, (m) => `very dry air (VPD ${m[1]} kPa)`],
  [/^viento de (\d+) km\/h$/, (m) => `wind of ${m[1]} km/h`],
  [/^temperatura de (\d+) C$/, (m) => `temperature of ${m[1]} C`],
  [/^maxima de (\d+) C$/, (m) => `maximum of ${m[1]} C`],
  [/^temperatura media semanal de (\d+) C$/, (m) => `weekly mean temperature of ${m[1]} C`],
  [/^temperatura ([+-]?[\d.]+) C respecto de lo normal$/, (m) => `temperature ${m[1]} C vs normal`],
  [/^combinacion de condiciones y epoca del anio$/, () => "combination of conditions and time of year"],
];

export function motivo(es: string | null | undefined, lang: Lang): string {
  if (!es) return "";
  if (lang === "es") return es;
  return es.split("; ").map((p) => {
    for (const [re, f] of MOTIVOS) { const m = p.match(re); if (m) return f(m); }
    return p;
  }).join("; ");
}
