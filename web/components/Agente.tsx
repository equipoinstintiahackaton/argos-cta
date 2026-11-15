"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { getSupabase } from "../lib/supabase";
import { useIdioma } from "../lib/i18n";
import Barras from "./Barras";
import "./agente.css";

type Visual = { tipo: "barras"; titulo: string; datos: { etiqueta: string; valor: number }[] } | { tipo: "tabla"; titulo: string; columnas: string[]; filas: (string | number)[][] };

type Msg = { role: "user" | "assistant"; content: string; error?: boolean; visuales?: Visual[] };

export default function Agente() {
  const { tr, lang } = useIdioma();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const fin = useRef<HTMLDivElement>(null);

  useEffect(() => { fin.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, cargando]);

  const ejemplos = [
    tr("Qué departamentos tienen mayor riesgo hoy?", "Which departments have the highest risk today?"),
    tr("Cuántos focos hubo en los últimos 3 días?", "How many hotspots in the last 3 days?"),
    tr("Cuál fue el incendio más largo registrado?", "What was the longest recorded fire?"),
    tr("Cómo está la humedad y los días sin lluvia?", "What is the humidity and days without rain?"),
    tr("Qué tan confiable es la escala de alerta?", "How reliable is the alert scale?"),
  ];

  async function enviar(pregunta: string) {
    const q = pregunta.trim();
    if (!q || cargando) return;
    const nuevos: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(nuevos); setTexto(""); setCargando(true);
    try {
      const { data } = (await getSupabase()?.auth.getSession()) ?? { data: { session: null } };
      const r = await fetch("/api/agente", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ idioma: lang, mensajes: nuevos.filter((m) => !m.error).map(({ role, content }) => ({ role, content })) }),
      });
      const j = await r.json();
      setMsgs([...nuevos, r.ok ? { role: "assistant", content: j.respuesta, visuales: j.visuales } : { role: "assistant", content: j.error ?? "Error", error: true }]);
    } catch {
      setMsgs([...nuevos, { role: "assistant", content: tr("No se pudo conectar con el agente.", "Could not reach the agent."), error: true }]);
    } finally { setCargando(false); }
  }

  const alEnviar = (e: FormEvent) => { e.preventDefault(); enviar(texto); };

  return (
    <div className="agente">
      <div className="ag-lista">
        {msgs.length === 0 && (
          <div className="ag-vacio">
            <p>{tr("Consulta técnica sobre los datos de ARGOS: riesgo, alertas, incendios, focos, clima y confiabilidad del modelo. Solo responde con lo que hay en la base de datos del sistema.", "Technical queries on ARGOS data: risk, alerts, fires, hotspots, weather and model reliability. It only answers with what is in the system database.")}</p>
            <div className="ag-ejemplos">{ejemplos.map((e) => <button key={e} onClick={() => enviar(e)}>{e}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={"ag-fila " + m.role}>
            <div className={"ag-msg " + m.role + (m.error ? " err" : "")}>{m.content}</div>
            {m.visuales?.map((v, k) => (
              <div key={k} className="ag-visual">
                <h4>{v.titulo}</h4>
                {v.tipo === "barras" ? <Barras datos={v.datos} /> : (
                  <div className="ag-tabla"><table className="tabla">
                    <thead><tr>{v.columnas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                    <tbody>{v.filas.map((f, r) => <tr key={r}>{f.map((x, c) => <td key={c}>{x}</td>)}</tr>)}</tbody>
                  </table></div>
                )}
              </div>
            ))}
          </div>
        ))}
        {cargando && <div className="ag-pensando">{tr("Consultando los datos...", "Querying the data...")}</div>}
        <div ref={fin} />
      </div>
      <form className="ag-form" onSubmit={alEnviar}>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={500} placeholder={tr("Escribí tu consulta técnica", "Type your technical question")} />
        <button type="submit" disabled={cargando || !texto.trim()}>{tr("Enviar", "Send")}</button>
      </form>
      <p className="nota">{tr("Las respuestas son estimaciones estadísticas basadas en datos satelitales. Ante una emergencia llamar al 911 o al 100.", "Answers are statistical estimates based on satellite data. In an emergency call 911 or 100.")}</p>
    </div>
  );
}
