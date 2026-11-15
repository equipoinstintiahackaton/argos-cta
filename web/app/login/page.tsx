"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import Nav from "../../components/Nav";
import Pie from "../../components/Pie";
import { getSupabase } from "../../lib/supabase";
import { useIdioma } from "../../lib/i18n";

export default function Login() {
  const router = useRouter();
  const { tr } = useIdioma();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const sb = getSupabase();
    if (!sb) { setError(tr("Falta la configuración de Supabase en el sitio.", "Supabase is not configured on this site.")); return; }
    setCargando(true);
    const { error: err } = await sb.auth.signInWithPassword({ email, password: clave });
    setCargando(false);
    if (err) {
      setError(err.message === "Invalid login credentials" ? tr("Correo o contraseña incorrectos.", "Incorrect email or password.") : err.message);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <>
      <Nav activo="login" />
      <div className="pagina">
        <section className="card login">
          <h2>{tr("Ingresar a", "Sign in to")} <span className="acento">ARGOS</span></h2>
          <p className="nota">{tr("Acceso para bomberos, brigadistas y organismos de emergencia. Las cuentas las crea el administrador.", "Access for firefighters, forest brigades and emergency agencies. Accounts are created by the administrator.")}</p>
          <form onSubmit={entrar}>
            <label>{tr("Correo electrónico", "Email")}
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>{tr("Contraseña", "Password")}
              <input type="password" required autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
            </label>
            {error && <div className="msg" style={{ padding: 0 }}>{error}</div>}
            <button type="submit" className="boton" disabled={cargando}>{cargando ? tr("Ingresando...", "Signing in...") : tr("Ingresar", "Sign in")}</button>
          </form>
          <div className="aviso-pagina" style={{ marginTop: 16 }}>
            <strong>{tr("Cuenta demo", "Demo account")}</strong> {tr("(para evaluar la plataforma)", "(to try the platform)")}<br />
            {tr("Correo", "Email")}: <code>demo@argos.com</code><br />
            {tr("Contraseña", "Password")}: <code>argos2026</code>
          </div>
          <p className="nota" style={{ marginTop: 14 }}><Link href="/">{tr("Volver al inicio", "Back to home")}</Link></p>
        </section>
      </div>
      <Pie />
    </>
  );
}
