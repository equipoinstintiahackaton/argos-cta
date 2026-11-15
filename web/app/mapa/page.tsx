"use client";

import Shell from "../../components/Shell";
import Dashboard from "../../components/Dashboard";

export default function Pagina() {
  return (
    <Shell activo="mapa">
      <Dashboard embebido />
    </Shell>
  );
}
