"use client";

import { useEffect, useState } from "react";
import Nav from "../../components/Nav";
import Protegido from "../../components/Protegido";
import Pie from "../../components/Pie";
import Dashboard from "../../components/Dashboard";
import Ambiente from "../../components/Ambiente";
import UltimosIncendios from "../../components/UltimosIncendios";
import { contar, ultimaFechaAlertas, ultimoFoco } from "../../lib/resumen";
import { fecha, num } from "../../lib/formato";

function Contenido() {
  const [recientes, setRecientes] = useState<number | null>(null);
  const [ultimo, setUltimo] = useState<string | null>(null);
  const [alertas, setAlertas] = useState<number | null>(null);
  const [fAlertas, setFAlertas] = useState<string | null>(null);
  const [incendios, setIncendios] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const u = await ultimoFoco();
      setUltimo(u);
      if (u) {
        const desde = new Date(new Date(u).getTime() - 3 * 86400000).toISOString();
        setRecientes(await contar("focos_vista", (q) => q.gte("ts_utc", desde)));
      }
      const fa = await ultimaFechaAlertas();
      setFAlertas(fa);
      if (fa) setAlertas(await contar("alertas", (q) => q.eq("fecha", fa)));
      setIncendios(await contar("incendios"));
    })();
  }, []);

  return (
    <>
      <Nav activo="dashboard" />
      <div className="pagina">
        <section className="presentacion">
          <div>
            <h1 className="titulo">Centro de monitoreo | Catamarca</h1>
            <p className="sub">Observacion satelital, riesgo estimado a 7 dias y registro historico para la prevencion de incendios forestales.</p>
          </div>
          <div className="estado">● PROTOTIPO · RIESGO ESTIMADO{ultimo ? ` · ultimo foco ${fecha(ultimo)}` : ""}</div>
        </section>

        <div className="aviso-pagina">
          <strong>Advertencia:</strong> ARGOS es un prototipo de apoyo informativo y no reemplaza los canales oficiales de emergencia.
          Las detecciones satelitales son anomalias termicas y no constituyen por si solas incendios confirmados. Los niveles de riesgo
          son estimaciones estadisticas: priorizan donde mirar, y la mayoria de las celdas en alerta no tendra fuego.
        </div>

        <div className="kpis">
          <div className="kpi"><b>{num(recientes)}</b><span>detecciones satelitales en los ultimos 3 dias (MODIS + VIIRS, NASA FIRMS)</span></div>
          <div className="kpi"><b>{num(alertas)}</b><span>celdas en alerta (naranja fuerte o mas){fAlertas ? ` al ${fAlertas.split("-").reverse().join("/")}` : ""}</span></div>
          <div className="kpi"><b>{num(incendios)}</b><span>incendios en el registro historico desde 2012</span></div>
          <div className="kpi"><b>16</b><span>departamentos de Catamarca monitoreados</span></div>
        </div>

        <section className="card" id="mapa">
          <h2><span className="acento">Mapa</span> de riesgo y alertas</h2>
          <p className="nota">Riesgo relativo por celda y probabilidad calibrada por departamento. Los puntos negros son focos satelitales recientes.</p>
          <Dashboard embebido />
        </section>

        <section className="card" id="registro">
          <h2><span className="acento">Registro</span> de incendios</h2>
          <UltimosIncendios />
        </section>

        <section className="card" id="ambiente">
          <h2><span className="acento">Condiciones</span> ambientales</h2>
          <Ambiente />
        </section>

        <section className="card" id="instituciones">
          <h2><span className="acento">Organismos</span> y equipos de emergencia</h2>
          <p className="nota">Espacio para integrar contactos y comunicados verificados de quienes trabajan en la prevencion y el combate de incendios en Catamarca.</p>
          <div className="grid4">
            <div className="tarjeta"><h3>Bomberos</h3><p>Cuarteles, contactos y reportes institucionales.</p><span className="tel">100</span></div>
            <div className="tarjeta"><h3>Emergencias</h3><p>Linea nacional de emergencias.</p><span className="tel">911</span></div>
            <div className="tarjeta"><h3>Bomberos voluntarios <span className="proximo">proximamente</span></h3><p>Asociaciones y servicios de bomberos voluntarios.</p></div>
            <div className="tarjeta"><h3>Brigadas y organismos <span className="proximo">proximamente</span></h3><p>Brigadas forestales y organismos provinciales: comunicados y datos oficiales.</p></div>
          </div>
        </section>
      </div>
      <Pie />
    </>
  );
}

export default function DashboardPage() {
  return (
    <Protegido>
      <Contenido />
    </Protegido>
  );
}
