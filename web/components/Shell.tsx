"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import Protegido from "./Protegido";
import { getSupabase } from "../lib/supabase";

export type Vista = "inicio" | "mapa" | "registro" | "ambiente" | "estadisticas" | "instituciones";

const ITEMS: { id: Vista; href: string; label: string; icono: ReactNode }[] = [
  { id: "inicio", href: "/dashboard", label: "Inicio del centro de monitoreo",
    icono: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></> },
  { id: "mapa", href: "/mapa", label: "Mapa de riesgo",
    icono: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></> },
  { id: "registro", href: "/registro", label: "Registro de incendios",
    icono: <><path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z" /></> },
  { id: "ambiente", href: "/ambiente", label: "Condiciones ambientales",
    icono: <><path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1A4.5 4.5 0 0 1 17 18z" /></> },
  { id: "estadisticas", href: "/estadisticas", label: "Estadisticas y confiabilidad",
    icono: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></> },
  { id: "instituciones", href: "/instituciones", label: "Organismos de emergencia",
    icono: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></> },
];

function Marco({ activo, hero, children }: { activo: Vista; hero?: boolean; children: ReactNode }) {
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    getSupabase()?.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? ""));
  }, []);

  async function salir() {
    await getSupabase()?.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div className={"gl-stage" + (hero ? " gl-hero-bg" : "")}>
      <aside className="gl-side">
        <span className="gl-pip" style={{ top: 118 + ITEMS.findIndex((i) => i.id === activo) * 66 }} />
        <Link href="/dashboard" className="gl-logo" aria-label="ARGOS, inicio"><img src="/logo-icon.png" alt="" /></Link>
        <nav className="gl-nav">
          {ITEMS.map((i) => (
            <Link key={i.id} href={i.href} aria-label={i.label} title={i.label} aria-current={i.id === activo ? "page" : undefined}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{i.icono}</svg>
            </Link>
          ))}
        </nav>
        <button className="gl-out" onClick={salir} aria-label="Cerrar sesion" title="Cerrar sesion">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9" /></svg>
        </button>
      </aside>
      <header className="gl-head">
        <div><span className="gl-hello">Centro de monitoreo</span><span className="gl-who">{email || "ARGOS"}</span></div>
        <span className="gl-lema">Conocer para prevenir.</span>
      </header>
      <main className="gl-main">{children}</main>
    </div>
  );
}

export default function Shell({ activo, hero, children }: { activo: Vista; hero?: boolean; children: ReactNode }) {
  return (
    <Protegido>
      <Marco activo={activo} hero={hero}>{children}</Marco>
    </Protegido>
  );
}
