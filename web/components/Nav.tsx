"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";

export type Activo = "inicio" | "dashboard" | "registro" | "estadisticas" | "login";

const LINKS: { id: Activo; href: string; label: string }[] = [
  { id: "inicio", href: "/", label: "Inicio" },
  { id: "dashboard", href: "/dashboard", label: "Dashboard" },
  { id: "registro", href: "/registro", label: "Registro de incendios" },
  { id: "estadisticas", href: "/estadisticas", label: "Estadisticas" },
];

export default function Nav({ activo }: { activo?: Activo }) {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setEmail(s?.user.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <header className="cab">
      <Link href="/" className="marca">
        <img src="/logo-icon.png" alt="ARGOS" />
        <div>
          <span className="marca-n">ARGOS</span>
          <span className="marca-s">ALERTA DE RIESGO GEOESPACIAL Y OBSERVACION SATELITAL</span>
        </div>
      </Link>
      <nav className="menu">
        {LINKS.filter((l) => l.id === "inicio" || email).map((l) => <Link key={l.id} href={l.href} className={activo === l.id ? "on" : ""}>{l.label}</Link>)}
        {email ? (
          <>
            <span className="usuario">{email}</span>
            <button className="salir" onClick={async () => { await getSupabase()?.auth.signOut(); window.location.href = "/"; }}>Salir</button>
          </>
        ) : (
          <Link href="/login" className="entrar">Ingresar</Link>
        )}
      </nav>
    </header>
  );
}
