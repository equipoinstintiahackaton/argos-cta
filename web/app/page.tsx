"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Nav from "../components/Nav";
import Pie from "../components/Pie";
import { contar, ultimoFoco } from "../lib/resumen";
import { fecha, num } from "../lib/formato";

const DEPTOS = ["Capital", "Ambato", "Ancasti", "Andalgala", "Antofagasta de la Sierra", "Belen", "Capayan", "El Alto",
  "Fray Mamerto Esquiu", "La Paz", "Paclin", "Poman", "Santa Maria", "Santa Rosa", "Tinogasta", "Valle Viejo"];

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
      <div className="land">
        <section className="hero">
          <div>
            <h1>ARGOS</h1>
            <h2>Alerta de Riesgo Geoespacial y Observacion Satelital</h2>
            <p className="texto">
              Conocer para prevenir. Descubri como evolucionan los incendios forestales en Catamarca mediante informacion
              satelital, mapas y analisis de datos.
            </p>
            <div className="botones">
              <Link href="/login" className="boton">Explorar Catamarca</Link>
            </div>
          </div>
        </section>

        <div className="kpis">
          <div className="kpi"><b>{num(focos)}</b><span>focos de calor en el historial (2012 a hoy)</span></div>
          <div className="kpi"><b>{num(incendios)}</b><span>incendios registrados con fecha, lugar y duracion</span></div>
          <div className="kpi"><b>16</b><span>departamentos de Catamarca monitoreados</span></div>
          <div className="kpi"><b style={{ fontSize: 18 }}>{ultimo ? fecha(ultimo) : "s/d"}</b><span>ultimo foco satelital recibido</span></div>
        </div>

        <section className="lsec" id="incendios">
          <h2 className="titulo">Los incendios en Catamarca</h2>
          <p className="descripcion">Conoce el impacto de los incendios forestales en la provincia y su evolucion a lo largo de los años.</p>
          <div className="contenedor">
            <div className="tarjeta"><img src="/medio-ambiente.jpg" alt="Paisaje de la puna catamarqueña" /><h3>Medio ambiente</h3><p>Comprender como los incendios afectan las sierras, los valles y los bosques de Catamarca.</p></div>
            <div className="tarjeta"><img src="/tecnologia-nasa.jpg" alt="Satelite GOES en orbita" /><h3>Tecnologia NASA</h3><p>Usamos informacion satelital (MODIS, VIIRS y proximamente GOES-19) para estudiar los focos de calor en el territorio.</p></div>
            <div className="tarjeta"><img className="claro" src="/datos-historicos.jpg" alt="Mapa de Catamarca con departamentos y localidades" /><h3>Datos historicos</h3><p>Trece años de detecciones depuradas y un modelo que estima donde es mas probable que aparezcan focos en los proximos 7 dias.</p></div>
          </div>
        </section>

        <section className="lsec" id="mapas">
          <h2 className="titulo">Mapa de incendios de Catamarca</h2>
          <p className="descripcion">Explora la distribucion geografica de los focos de calor registrados en los 16 departamentos de Catamarca.</p>
          <div className="mapa-caja mapa-sat">
            <img src="/catamarca-satelital.jpg" alt="Mapa satelital de la provincia de Catamarca" />
            <div>
              <h3>Mapa interactivo de Catamarca</h3>
              <p>Explora la distribucion de los focos de calor y el riesgo estimado en los 16 departamentos.</p>
              <div className="deptos">{DEPTOS.map((d) => <span key={d}>{d}</span>)}</div>
              <Link href="/login" className="boton">Abrir el mapa</Link>
            </div>
          </div>
        </section>

        <section className="lsec" id="proyecto">
          <h2 className="titulo">Sobre ARGOS</h2>
          <p className="descripcion">
            ARGOS (Alerta de Riesgo Geoespacial y Observacion Satelital) es el proyecto de un equipo catamarqueño participante del
            NASA Space Apps Challenge. Nuestro objetivo es usar la tecnologia y los datos satelitales para comprender mejor los
            incendios forestales en Catamarca y generar conciencia ambiental en toda la provincia. ARGOS prioriza donde mirar:
            complementa y no reemplaza el criterio operativo de bomberos y brigadas.
          </p>
          <div className="botones" style={{ marginTop: 10 }}>
            <Link href="/login" className="boton sec">Ingresar</Link>
          </div>
        </section>
      </div>
      <Pie />
    </>
  );
}
