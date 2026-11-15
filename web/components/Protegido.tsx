"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";
import { useIdioma } from "../lib/i18n";

/** Muestra el contenido solo con sesion iniciada; si no, lleva a /login. */
export default function Protegido({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { tr } = useIdioma();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { router.replace("/login"); return; }
    sb.auth.getSession().then(({ data }) => {
      if (data.session) setOk(true);
      else router.replace("/login");
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      if (!s) router.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  if (!ok) return <div className="pagina"><p className="nota">{tr("Verificando sesión...", "Checking session...")}</p></div>;
  return <>{children}</>;
}
