"use client";

import Shell from "../../components/Shell";
import Inicio from "../../components/Inicio";

export default function Pagina() {
  return (
    <Shell activo="inicio" hero>
      <Inicio />
    </Shell>
  );
}
