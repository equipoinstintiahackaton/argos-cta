"use client";

import Shell from "../../components/Shell";
import Ambiente from "../../components/Ambiente";
import { useIdioma } from "../../lib/i18n";

export default function Pagina() {
  const { tr } = useIdioma();
  return (
    <Shell activo="ambiente">
      <div className="pagina">
        <h1 className="titulo">{tr("Condiciones ambientales", "Environmental conditions")}</h1>
        <p className="sub">{tr("Clima reciente por departamento (NASA POWER). Es el insumo del modelo: aire seco, calor y días sin lluvia aumentan la probabilidad de foco.", "Recent weather by department (NASA POWER). It is a model input: dry air, heat and days without rain raise hotspot probability.")}</p>
        <section className="card"><Ambiente /></section>
      </div>
    </Shell>
  );
}
