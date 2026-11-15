"use client";

import Shell from "../../components/Shell";
import Agente from "../../components/Agente";
import { useIdioma } from "../../lib/i18n";

export default function Pagina() {
  const { tr } = useIdioma();
  return (
    <Shell activo="agente">
      <div className="pagina">
        <h1 className="titulo">{tr("Agente técnico ARGOS", "ARGOS technical agent")}</h1>
        <p className="sub">{tr("Asistente de IA que responde únicamente con los datos del sistema.", "AI assistant that answers only with the system's data.")}</p>
        <Agente />
      </div>
    </Shell>
  );
}
