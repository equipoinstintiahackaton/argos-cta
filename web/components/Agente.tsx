"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { getSupabase } from "../lib/supabase";
import { useIdioma } from "../lib/i18n";
import Barras from "./Barras";
import "./agente.css";

type Visual = { tipo: "barras"; titulo: string; datos: { etiqueta: string; valor: number }[] } | { tipo: "tabla"; titulo: string; columnas: string[]; filas: (string | number)[][] };
type Msg = { role: "user" | "assistant"; content: string; error?: boolean; visuales?: Visual[] };

/** Quita restos de Markdown (asteriscos, almohadillas, backticks) y deja las listas con vineta. */
function limpiar(t: string) {
  return t
    .replace(/\*\*(.+?)\*\*/gs, "$1").replace(/__(.+?)__/gs, "$1").replace(/\*(\S[^*\n]*?)\*/g, "$1")
    .replace(/`+/g, "").replace(/^\s{0,3}#{1,6}\s*/gm, "").replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/naranja_fuerte/g, "naranja fuerte").replace(/\n{3,}/g, "\n\n").trim();
}

function Texto({ t }: { t: string }) {
  return (
    <>
      {limpiar(t).split("\n").map((l, i) =>
        l.startsWith("• ") ? <div key={i} className="ag-li"><span>•</span><span>{l.slice(2)}</span></div>
          : l.trim() === "" ? <div key={i} className="ag-sp" /> : <p key={i}>{l}</p>)}
    </>
  );
}

export default function Agente() {
  const { tr, lang } = useIdioma();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const fin = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { fin.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, cargando]);
  useEffect(() => {
    const el = caja.current; if (!el) return;
    el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [texto]);

  const ejemplos = [
    tr("¿Qué departamentos tienen mayor riesgo hoy?", "Which departments have the highest risk today?"),
    tr("¿Cuántos focos hubo en los últimos 3 días?", "How many hotspots in the last 3 days?"),
    tr("¿Cuál fue el incendio más largo registrado?", "What was the longest recorded fire?"),
    tr("Mostrame los focos por mes", "Show hotspots by month"),
    tr("¿Cómo está la humedad y los días sin lluvia?", "What is the humidity and days without rain?"),
    tr("¿Qué tan confiable es la escala de alerta?", "How reliable is the alert scale?"),
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
  const alTeclear = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(texto); }
  };

  return (
    <div className="agente">
      <header className="ag-cab">
        <img src="/logo-icon.png" alt="" />
        <div><b>{tr("Agente ARGOS", "ARGOS agent")}</b><span><i />{tr("Responde solo con los datos del sistema", "Answers only with system data")}</span></div>
        {msgs.length > 0 && <button className="ag-nuevo" onClick={() => setMsgs([])}>{tr("Nueva consulta", "New chat")}</button>}
      </header>

      <div className="ag-lista">
        {msgs.length === 0 && (
          <div className="ag-vacio">
            <img src="/logo-icon.png" alt="" />
            <h3>{tr("¿Qué necesitás saber?", "What do you need to know?")}</h3>
            <p>{tr("Riesgo, alertas, incendios, focos, clima y confiabilidad del modelo, con gráficos y tablas.", "Risk, alerts, fires, hotspots, weather and model reliability, with charts and tables.")}</p>
            <div className="ag-ejemplos">{ejemplos.map((e) => <button key={e} onClick={() => enviar(e)}>{e}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={"ag-fila " + m.role}>
            {m.role === "assistant" && <img className="ag-av" src="/logo-icon.png" alt="" />}
            <div className="ag-col">
              <div className={"ag-msg " + m.role + (m.error ? " err" : "")}><Texto t={m.content} /></div>
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
          </div>
        ))}
        {cargando && (
          <div className="ag-fila assistant">
            <img className="ag-av" src="/logo-icon.png" alt="" />
            <div className="ag-msg assistant ag-puntos"><i /><i /><i /></div>
          </div>
        )}
        <div ref={fin} />
      </div>

      <form className="ag-form" onSubmit={alEnviar}>
        <textarea ref={caja} rows={1} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={alTeclear} maxLength={500}
          placeholder={tr("Escribí tu consulta técnica", "Type your technical question")} />
        <button type="submit" disabled={cargando || !texto.trim()} aria-label={tr("Enviar", "Send")}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </button>
      </form>
      <p className="ag-pie">{tr("Estimaciones estadísticas basadas en datos satelitales. Un foco es una detección, no un incendio confirmado.", "Statistical estimates based on satellite data. A hotspot is a detection, not a confirmed fire.")}</p>
    </div>
  );
}
