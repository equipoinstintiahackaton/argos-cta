"use client";

import Shell from "../../components/Shell";
import { useIdioma } from "../../lib/i18n";


const CUARTELES: { nombre: string; direccion: string; en?: string; tel: { t: string; v: string }[] }[] = [
  { nombre: "Andalgalá", direccion: "Bomberos Voluntarios. Av. José P. Jais S/N", en: "Volunteer Firefighters. Av. Jose P. Jais S/N", tel: [{ t: "(03835) 15 695129", v: "0383515695129" }] },
  { nombre: "Chumbicha", direccion: "Bomberos Voluntarios", en: "Volunteer Firefighters", tel: [{ t: "(0383) 4568580", v: "03834568580" }] },
  { nombre: "Valle Viejo", direccion: "Bomberos Voluntarios", en: "Volunteer Firefighters", tel: [{ t: "(03834) 15 371699", v: "0383415371699" }, { t: "(03834) 15 299407", v: "0383415299407" }] },
  { nombre: "Tinogasta", direccion: "Asociación de Bomberos Voluntarios", en: "Volunteer Firefighters Association", tel: [{ t: "(03837) 511699", v: "03837511699" }] },
  { nombre: "San Fernando del Valle de Catamarca", direccion: "Dirección de Bomberos de la Policía. Av. Acosta Villafañez N° 1600", en: "Police Fire Department. Av. Acosta Villafañez N° 1600", tel: [{ t: "(03834) 422502", v: "03834422502" }, { t: "(03834) 431176", v: "03834431176" }] },
];

export default function Pagina() {
  const { tr } = useIdioma();
  return (
    <Shell activo="instituciones">
      <div className="pagina">
        <h1 className="titulo">{tr("Organismos y equipos de emergencia", "Emergency agencies and teams")}</h1>
        <p className="sub">{tr("Espacio para integrar contactos y comunicados verificados de quienes trabajan en la prevención y el combate de incendios en Catamarca.", "Space for verified contacts and announcements from those working on wildfire prevention and fighting in Catamarca.")}</p>
        <div className="grid4">
          <div className="tarjeta"><h3>{tr("Emergencias", "Emergencies")}</h3><p>{tr("Línea nacional de emergencias.", "National emergency line.")}</p><a className="tel" href="tel:911">911</a></div>
          <div className="tarjeta"><h3>{tr("Bomberos", "Fire department")}</h3><p>{tr("Línea nacional de bomberos.", "National fire department line.")}</p><a className="tel" href="tel:100">100</a></div>
        </div>
        <h2 className="h3" style={{ fontSize: 16, marginTop: 22 }}>{tr("Bomberos voluntarios y bomberos de la policia", "Volunteer firefighters and police fire departments")}</h2>
        <div className="grid3">
          {CUARTELES.map((c) => (
            <div key={c.nombre} className="tarjeta">
              <h3>{c.nombre}</h3>
              {c.direccion && <p>{tr(c.direccion, c.en ?? c.direccion)}</p>}
              {c.tel.map((t) => <a key={t.v} className="tel" style={{ fontSize: 17 }} href={`tel:${t.v}`}>{t.t}</a>)}
            </div>
          ))}
        </div>
        <p className="nota" style={{ marginTop: 14 }}>{tr("Números cargados por el equipo de ARGOS. Ante una emergencia, llamar siempre primero al 911 o al 100. Brigadas forestales y organismos provinciales: próximamente.", "Numbers entered by the ARGOS team. In an emergency, always call 911 or 100 first. Forest brigades and provincial agencies: coming soon.")}</p>
      </div>
    </Shell>
  );
}
