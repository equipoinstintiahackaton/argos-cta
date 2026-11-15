"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Pie from "../components/Pie";
import Reveal from "../components/Reveal";
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
    <div className="lp">
      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-hero-bg" aria-hidden="true" />
        <div className="lp-hero-velo" aria-hidden="true" />

        <nav className="lp-nav glass">
          <Link href="/" className="lp-marca"><img src="/logo-icon.png" alt="" /><span>ARGOS</span></Link>
          <div className="lp-links">
            <a href="#sobre">Sobre ARGOS</a>
            <a href="#enfoque">Enfoque</a>
            <a href="#que-hace">Que hace</a>
          </div>
          <Link href="/login" className="lp-btn glass">Ingresar</Link>
        </nav>

        <div className="lp-hero-contenido">
          <h1 className="serif">Conocer para <em>prevenir</em>.</h1>
          <p className="lp-sub">Alerta de Riesgo Geoespacial y Observacion Satelital. Tecnologia satelital al servicio de la prevencion y el monitoreo forestal en Catamarca.</p>
          <Link href="/login" className="lp-cta glass">
            <span>Explorar Catamarca</span>
            <i aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></i>
          </Link>
          <a href="#enfoque" className="lp-btn glass lp-sec">Como funciona</a>
        </div>

        <div className="lp-kpis">
          <div className="glass"><b>{num(focos)}</b><span>focos de calor en el historial</span></div>
          <div className="glass"><b>{num(incendios)}</b><span>incendios registrados</span></div>
          <div className="glass"><b>16</b><span>departamentos monitoreados</span></div>
          <div className="glass"><b className="chico">{ultimo ? fecha(ultimo) : "s/d"}</b><span>ultimo foco recibido</span></div>
        </div>
      </section>

      {/* SOBRE */}
      <section className="lp-sec-about" id="sobre">
        <Reveal><p className="lp-label">Sobre ARGOS</p></Reveal>
        <Reveal retraso={0.1}>
          <h2 className="serif lp-h-grande">Satelites y datos <em>al servicio de</em> quienes cuidan el monte, <em>para actuar antes del fuego.</em></h2>
        </Reveal>
      </section>

      {/* ENFOQUE: imagen destacada */}
      <section className="lp-destacado" id="enfoque">
        <Reveal>
          <div className="lp-marco">
            <img src="/medio-ambiente.jpg" alt="Paisaje de la puna catamarqueña" />
            <div className="lp-marco-velo" aria-hidden="true" />
            <div className="lp-marco-pie">
              <div className="glass lp-tarjeta-g">
                <p className="lp-label chico">Nuestro enfoque</p>
                <p>Un modelo de aprendizaje automatico, validado año por año, estima donde es mas probable que aparezcan focos en los proximos 7 dias. ARGOS prioriza donde mirar: no predice incendios con certeza.</p>
              </div>
              <Link href="/login" className="lp-btn glass">Ver el centro de monitoreo</Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* FILOSOFIA */}
      <section className="lp-filo">
        <Reveal><h2 className="serif lp-h-medio">Datos <em>x</em> Prevencion</h2></Reveal>
        <div className="lp-filo-grid">
          <Reveal><div className="lp-img-redondeada"><img src="/tecnologia-nasa.jpg" alt="Satelite GOES en orbita" /></div></Reveal>
          <Reveal retraso={0.1}>
            <div className="lp-filo-textos">
              <div>
                <p className="lp-label chico">Observar</p>
                <p>Reunimos las detecciones de calor de MODIS y VIIRS (NASA FIRMS) y el clima diario de NASA POWER, y las depuramos: duplicados, fuentes industriales fijas y focos fuera de la provincia. Proximamente, GOES-19 aportara alertas cada 10 minutos.</p>
              </div>
              <hr />
              <div>
                <p className="lp-label chico">Anticipar</p>
                <p>Una escala de 7 niveles, de verde a negro, muestra donde mirar primero. Cada nivel se mide contra lo que paso realmente, en datos que el modelo nunca vio.</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* QUE HACE */}
      <section className="lp-serv" id="que-hace">
        <Reveal>
          <div className="lp-serv-cab"><h2>Que hace ARGOS</h2><span>Tres pilares</span></div>
        </Reveal>
        <div className="lp-serv-grid">
          <Reveal>
            <article className="glass lp-card">
              <div className="lp-card-img"><img src="/medio-ambiente.jpg" alt="Paisaje de la puna catamarqueña" /></div>
              <div className="lp-card-cuerpo"><p className="lp-label chico">Territorio</p><h3>Medio ambiente</h3><p>Comprender como los incendios afectan las sierras, los valles y los bosques de Catamarca.</p></div>
            </article>
          </Reveal>
          <Reveal retraso={0.15}>
            <article className="glass lp-card">
              <div className="lp-card-img"><img src="/tecnologia-nasa.jpg" alt="Satelite GOES en orbita" /></div>
              <div className="lp-card-cuerpo"><p className="lp-label chico">Tecnologia</p><h3>Tecnologia NASA</h3><p>Informacion satelital (MODIS, VIIRS y proximamente GOES-19) para estudiar los focos de calor del territorio.</p></div>
            </article>
          </Reveal>
          <Reveal retraso={0.3}>
            <article className="glass lp-card">
              <div className="lp-card-img claro"><img src="/datos-historicos.jpg" alt="Mapa de Catamarca con departamentos y localidades" /></div>
              <div className="lp-card-cuerpo"><p className="lp-label chico">Historia</p><h3>Datos historicos</h3><p>Trece años de detecciones depuradas y un registro de incendios con fecha, lugar y duracion.</p></div>
            </article>
          </Reveal>
        </div>
      </section>

      <Pie />
    </div>
  );
}
