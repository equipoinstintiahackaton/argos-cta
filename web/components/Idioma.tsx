"use client";

import { useIdioma } from "../lib/i18n";

/** Selector ES | EN. */
export default function Idioma({ className = "" }: { className?: string }) {
  const { lang, setLang } = useIdioma();
  return (
    <div className={"idioma " + className} role="group" aria-label="Idioma / Language">
      <button className={lang === "es" ? "on" : ""} onClick={() => setLang("es")} aria-pressed={lang === "es"}>ES</button>
      <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")} aria-pressed={lang === "en"}>EN</button>
    </div>
  );
}
