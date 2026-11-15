"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Pie from "../components/Pie";
import Reveal from "../components/Reveal";
import { contar, ultimoFoco } from "../lib/resumen";
import { fecha, num } from "../lib/formato";
import { useIdioma } from "../lib/i18n";
import Idioma from "../components/Idioma";

export default function Landing() {
  const { tr } = useIdioma();
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
            <a href="#sobre">{tr("Sobre ARGOS", "About ARGOS")}</a>
            <a href="#enfoque">{tr("Enfoque", "Approach")}</a>
            <a href="#que-hace">{tr("Qué hace", "What it does")}</a>
          </div>
          <Idioma />
          <Link href="/login" className="lp-btn glass">{tr("Ingresar", "Sign in")}</Link>
        </nav>

        <div className="lp-hero-contenido">
          <h1 className="serif">{tr("Conocer para", "Know to")} <em>{tr("prevenir", "prevent")}</em>.</h1>
          <p className="lp-sub">{tr("Alerta de Riesgo Geoespacial y Observación Satelital. Tecnología satelital al servicio de la prevención y el monitoreo forestal en Catamarca.", "Geospatial Risk Alert and Satellite Observation. Satellite technology for wildfire prevention and forest monitoring in Catamarca.")}</p>
          <Link href="/login" className="lp-cta glass">
            <span>{tr("Explorar Catamarca", "Explore Catamarca")}</span>
            <i aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></i>
          </Link>
          <a href="#enfoque" className="lp-btn glass lp-sec">{tr("Cómo funciona", "How it works")}</a>
        </div>

        <div className="lp-kpis">
          <div className="glass"><b>{num(focos)}</b><span>{tr("focos de calor en el historial", "hotspots in the record")}</span></div>
          <div className="glass"><b>{num(incendios)}</b><span>{tr("incendios registrados", "fires recorded")}</span></div>
          <div className="glass"><b>16</b><span>{tr("departamentos monitoreados", "departments monitored")}</span></div>
          <div className="glass"><b className="chico">{ultimo ? fecha(ultimo) : tr("s/d", "n/a")}</b><span>{tr("último foco recibido", "latest hotspot received")}</span></div>
        </div>
      </section>

      {/* SOBRE */}
      <section className="lp-sec-about" id="sobre">
        <Reveal><p className="lp-label">{tr("Sobre ARGOS", "About ARGOS")}</p></Reveal>
        <Reveal retraso={0.1}>
          <h2 className="serif lp-h-grande">{tr(<>Satélites y datos <em>al servicio de</em> quienes cuidan el monte, <em>para actuar antes del fuego.</em></>, <>Satellites and data <em>in service of</em> those who protect the wilderness, <em>to act before the fire.</em></>)}</h2>
        </Reveal>
      </section>

      {/* ENFOQUE: imagen destacada */}
      <section className="lp-destacado" id="enfoque">
        <Reveal>
          <div className="lp-marco">
            <div className="lp-marco-fondo" style={{ backgroundImage: "url(/catamarca-landsat.jpg)" }} aria-hidden="true" />
            <img className="lp-marco-img" src="/catamarca-landsat.jpg" alt={tr("Imagen satelital de la provincia de Catamarca y sus límites", "Satellite image of Catamarca province and its borders")} />
            <div className="lp-marco-velo" aria-hidden="true" />
            <div className="lp-marco-pie">
              <div className="glass lp-tarjeta-g">
                <p className="lp-label chico">{tr("Nuestro enfoque", "Our approach")}</p>
                <p>{tr("Un modelo de aprendizaje automático, validado año por año, estima dónde es más probable que aparezcan focos en los próximos 7 días. ARGOS prioriza dónde mirar: no predice incendios con certeza.", "A machine learning model, validated year by year, estimates where hotspots are most likely to appear in the next 7 days. ARGOS prioritizes where to look: it does not predict fires with certainty.")}</p>
              </div>
              <Link href="/login" className="lp-btn glass">{tr("Ver el centro de monitoreo", "Open the monitoring center")}</Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* FILOSOFIA */}
      <section className="lp-filo">
        <Reveal><h2 className="serif lp-h-medio">{tr("Datos", "Data")} <em>x</em> {tr("Prevención", "Prevention")}</h2></Reveal>
        <div className="lp-filo-grid">
          <Reveal><div className="lp-img-redondeada"><img src="/tecnologia-nasa.jpg" alt={tr("Satélite GOES en órbita", "GOES satellite in orbit")} /></div></Reveal>
          <Reveal retraso={0.1}>
            <div className="lp-filo-textos">
              <div>
                <p className="lp-label chico">{tr("Observar", "Observe")}</p>
                <p>{tr("Reunimos las detecciones de calor de MODIS y VIIRS (NASA FIRMS) y el clima diario de NASA POWER, y las depuramos: duplicados, fuentes industriales fijas y focos fuera de la provincia. Próximamente, GOES-19 aportara alertas cada 10 minutos.", "We gather MODIS and VIIRS heat detections (NASA FIRMS) and daily NASA POWER weather, and clean them: duplicates, fixed industrial sources and hotspots outside the province. Soon, GOES-19 will add alerts every 10 minutes.")}</p>
              </div>
              <hr />
              <div>
                <p className="lp-label chico">{tr("Anticipar", "Anticipate")}</p>
                <p>{tr("Una escala de 7 niveles, de verde a negro, muestra dónde mirar primero. Cada nivel se mide contra lo que pasó realmente, en datos que el modelo nunca vio.", "A 7-level scale, from green to black, shows where to look first. Each level is measured against what actually happened, on data the model never saw.")}</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* QUE HACE */}
      <section className="lp-serv" id="que-hace">
        <Reveal>
          <div className="lp-serv-cab"><h2>{tr("Qué hace ARGOS", "What ARGOS does")}</h2><span>{tr("Tres pilares", "Three pillars")}</span></div>
        </Reveal>
        <div className="lp-serv-grid">
          <Reveal>
            <article className="glass lp-card">
              <div className="lp-card-img"><img src="/medio-ambiente.jpg" alt={tr("Paisaje de la puna catamarqueña", "Catamarca highland landscape")} /></div>
              <div className="lp-card-cuerpo"><p className="lp-label chico">{tr("Territorio", "Territory")}</p><h3>{tr("Medio ambiente", "Environment")}</h3><p>{tr("Comprender cómo los incendios afectan las sierras, los valles y los bosques de Catamarca.", "Understanding how fires affect the mountains, valleys and forests of Catamarca.")}</p></div>
            </article>
          </Reveal>
          <Reveal retraso={0.15}>
            <article className="glass lp-card">
              <div className="lp-card-img"><img src="/tecnologia-nasa.jpg" alt={tr("Satélite GOES en órbita", "GOES satellite in orbit")} /></div>
              <div className="lp-card-cuerpo"><p className="lp-label chico">{tr("Tecnología", "Technology")}</p><h3>{tr("Tecnología NASA", "NASA technology")}</h3><p>{tr("Información satelital (MODIS, VIIRS y próximamente GOES-19) para estudiar los focos de calor del territorio.", "Satellite information (MODIS, VIIRS and soon GOES-19) to study the territory's hotspots.")}</p></div>
            </article>
          </Reveal>
          <Reveal retraso={0.3}>
            <article className="glass lp-card">
              <div className="lp-card-img claro"><img src="/datos-historicos.jpg" alt={tr("Mapa de Catamarca con departamentos y localidades", "Map of Catamarca with departments and towns")} /></div>
              <div className="lp-card-cuerpo"><p className="lp-label chico">{tr("Historia", "History")}</p><h3>{tr("Datos históricos", "Historical data")}</h3><p>{tr("Trece años de detecciones depuradas y un registro de incendios con fecha, lugar y duración.", "Thirteen years of cleaned detections and a fire registry with date, place and duration.")}</p></div>
            </article>
          </Reveal>
        </div>
      </section>

      <Pie />
    </div>
  );
}
