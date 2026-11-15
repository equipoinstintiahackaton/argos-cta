"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";
import { useIdioma } from "../lib/i18n";
import Idioma from "./Idioma";

export type Activo = "inicio" | "dashboard" | "registro" | "estadisticas" | "login";

const LINKS: { id: Activo; href: string; es: string; en: string }[] = [
  { id: "inicio", href: "/", es: "Inicio", en: "Home" },
  { id: "dashboard", href: "/dashboard", es: "Dashboard", en: "Dashboard" },
  { id: "registro", href: "/registro", es: "Registro de incendios", en: "Fire registry" },
  { id: "estadisticas", href: "/estadisticas", es: "Estadísticas", en: "Statistics" },
];

export default function Nav({ activo }: { activo?: Activo }) {
  const [email, setEmail] = useState<string | null>(null);
  const { tr } = useIdioma();

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setEmail(s?.user.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <header className="cab">
      <Link href={email ? "/dashboard" : "/"} className="marca">
        <img src="/logo-icon.png" alt="ARGOS" />
        <div>
          <span className="marca-n">ARGOS</span>
        </div>
      </Link>
      <nav className="menu">
        <Idioma />
        {LINKS.filter((l) => (email ? l.id !== "inicio" : l.id === "inicio")).map((l) => <Link key={l.id} href={l.href} className={activo === l.id ? "on" : ""}>{tr(l.es, l.en)}</Link>)}
        {email ? (
          <>
            <span className="usuario">{email}</span>
            <button className="salir" onClick={async () => { await getSupabase()?.auth.signOut(); window.location.href = "/"; }}>{tr("Salir", "Sign out")}</button>
          </>
        ) : (
          <Link href="/login" className="entrar">{tr("Ingresar", "Sign in")}</Link>
        )}
      </nav>
    </header>
  );
}
