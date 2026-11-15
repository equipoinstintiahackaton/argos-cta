"use client";

import Shell from "../../components/Shell";
import Ambiente from "../../components/Ambiente";

export default function Pagina() {
  return (
    <Shell activo="ambiente">
      <div className="pagina">
        <h1 className="titulo">Condiciones ambientales</h1>
        <p className="sub">Clima reciente por departamento (NASA POWER). Es el insumo del modelo: aire seco, calor y dias sin lluvia aumentan la probabilidad de foco.</p>
        <section className="card"><Ambiente /></section>
      </div>
    </Shell>
  );
}
