"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Nav from "../components/Nav";
import Pie from "../components/Pie";
import { contar, ultimoFoco } from "../lib/resumen";
import { fecha, num } from "../lib/formato";

export default function Landing() {
  const [focos, setFocos] = useState<number | null>(null);
  const [incendios, setIncendios] = useState<number | null>(null);
  const [ultimo, setUltimo] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setFocos(await contar("focos"));
      setIncendios(await contar("incendios"));
      setUltimo(await ultimoFoco());
    })();
  }, []);

  return (
    <>
      <Nav activo="inicio" />
      <div className="pagina">
        <section className="hero">
          <div>
            <h1>ARGOS</h1>
            <p className="desc">ALERTA DE RIESGO GEOESPACIAL Y OBSERVACION SATELITAL</p>
            <p className="lema">Conocer para prevenir.</p>
            <p className="texto">
              Tecnologia satelital al servicio de la prevencion y el monitoreo forestal en Catamarca. ARGOS combina trece años de
              detecciones de calor MODIS y VIIRS con el clima para estimar donde es mas probable que aparezcan focos en los proximos
              7 dias, y asi priorizar donde mirar.
            </p>
            <div className="botones">
              <Link href="/dashboard" className="boton">Ver el dashboard</Link>
              <Link href="/registro" className="boton sec">Registro de incendios</Link>
            </div>
          </div>
          <img src="/logo.png" alt="Logo de ARGOS" />
        </section>

        <div className="kpis">
          <div className="kpi"><b>{num(focos)}</b><span>focos de calor en el historial (2012 a hoy)</span></div>
          <div className="kpi"><b>{num(incendios)}</b><span>incendios registrados con fecha, lugar y duracion</span></div>
          <div className="kpi"><b>16</b><span>departamentos de Catamarca monitoreados</span></div>
          <div className="kpi"><b style={{ fontSize: 18 }}>{ultimo ? fecha(ultimo) : "s/d"}</b><span>ultimo foco satelital recibido</span></div>
        </div>

        <section className="card">
          <h2>Como funciona</h2>
          <div className="grid3" style={{ marginTop: 12 }}>
            <div className="tarjeta"><span className="num">1</span><h3>Observa</h3>
              <p>Reune las detecciones de calor de MODIS y VIIRS (NASA FIRMS) y el clima diario de NASA POWER, y las depura: duplicados, fuentes industriales fijas y focos fuera de la provincia.</p></div>
            <div className="tarjeta"><span className="num">2</span><h3>Calcula</h3>
              <p>Un modelo de aprendizaje automatico, validado año por año contra reglas simples, estima el riesgo de cada celda de 36 km2 y la probabilidad de foco por departamento.</p></div>
            <div className="tarjeta"><span className="num">3</span><h3>Alerta</h3>
              <p>Una escala de 7 niveles, de verde a negro, muestra donde mirar primero. Cada nivel se mide contra lo que paso realmente en datos que el modelo no vio.</p></div>
          </div>
        </section>

        <section className="card">
          <h2>Fuentes de datos</h2>
          <div className="grid3" style={{ marginTop: 12 }}>
            <div className="tarjeta"><h3>NASA FIRMS</h3><p>Focos activos de MODIS y VIIRS, desde 2012, con actualizacion cercana al tiempo real.</p></div>
            <div className="tarjeta"><h3>NASA POWER</h3><p>Temperatura, humedad, viento y lluvia diarios para estimar la sequedad del combustible.</p></div>
            <div className="tarjeta"><h3>GOES-19 <span className="proximo">en integracion</span></h3><p>Satelite geoestacionario con deteccion de fuego cada 10 minutos, para alerta temprana a confirmar.</p></div>
          </div>
        </section>

        <section className="card">
          <h2>Para quienes esta pensado</h2>
          <p className="nota">Bomberos, bomberos voluntarios, brigadas forestales y organismos provinciales de emergencia. ARGOS prioriza donde mirar: la mayoria de las celdas en alerta no tendra fuego, y por eso complementa y no reemplaza el criterio operativo.</p>
          <div className="botones" style={{ marginTop: 10 }}>
            <Link href="/estadisticas" className="boton sec">Ver estadisticas y confiabilidad</Link>
            <Link href="/login" className="boton sec">Ingresar</Link>
          </div>
        </section>
      </div>
      <Pie />
    </>
  );
}
