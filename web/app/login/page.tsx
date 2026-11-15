"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import Nav from "../../components/Nav";
import Pie from "../../components/Pie";
import { getSupabase } from "../../lib/supabase";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const sb = getSupabase();
    if (!sb) { setError("Falta la configuracion de Supabase en el sitio."); return; }
    setCargando(true);
    const { error: err } = await sb.auth.signInWithPassword({ email, password: clave });
    setCargando(false);
    if (err) {
      setError(err.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : err.message);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <>
      <Nav activo="login" />
      <div className="pagina">
        <section className="card login">
          <h2>Ingresar a <span className="acento">ARGOS</span></h2>
          <p className="nota">Acceso para bomberos, brigadistas y organismos de emergencia. Las cuentas las crea el administrador. El dashboard y el registro tambien se pueden ver sin ingresar.</p>
          <form onSubmit={entrar}>
            <label>Correo electronico
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>Contraseña
              <input type="password" required autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
            </label>
            {error && <div className="msg" style={{ padding: 0 }}>{error}</div>}
            <button type="submit" className="boton" disabled={cargando}>{cargando ? "Ingresando..." : "Ingresar"}</button>
          </form>
          <p className="nota" style={{ marginTop: 14 }}><Link href="/dashboard">Continuar sin ingresar</Link></p>
        </section>
      </div>
      <Pie />
    </>
  );
}
