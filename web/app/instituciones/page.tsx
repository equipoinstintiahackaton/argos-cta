"use client";

import Shell from "../../components/Shell";


const CUARTELES = [
  { nombre: "Andalgala", direccion: "Bomberos Voluntarios. Av. Jose P. Jais S/N", tel: [{ t: "(03835) 15 695129", v: "0383515695129" }] },
  { nombre: "Chumbicha", direccion: "Bomberos Voluntarios", tel: [{ t: "(0383) 4568580", v: "03834568580" }] },
  { nombre: "Valle Viejo", direccion: "Bomberos Voluntarios", tel: [{ t: "(03834) 15 371699", v: "0383415371699" }, { t: "(03834) 15 299407", v: "0383415299407" }] },
  { nombre: "Tinogasta", direccion: "Asociacion de Bomberos Voluntarios", tel: [{ t: "(03837) 511699", v: "03837511699" }] },
  { nombre: "San Fernando del Valle de Catamarca", direccion: "Direccion de Bomberos de la Policia. Av. Acosta Villafañez N° 1600", tel: [{ t: "(03834) 422502", v: "03834422502" }, { t: "(03834) 431176", v: "03834431176" }] },
];

export default function Pagina() {
  return (
    <Shell activo="instituciones">
      <div className="pagina">
        <h1 className="titulo">Organismos y equipos de emergencia</h1>
        <p className="sub">Espacio para integrar contactos y comunicados verificados de quienes trabajan en la prevencion y el combate de incendios en Catamarca.</p>
        <div className="grid4">
          <div className="tarjeta"><h3>Emergencias</h3><p>Linea nacional de emergencias.</p><a className="tel" href="tel:911">911</a></div>
          <div className="tarjeta"><h3>Bomberos</h3><p>Linea nacional de bomberos.</p><a className="tel" href="tel:100">100</a></div>
        </div>
        <h2 className="h3" style={{ fontSize: 16, marginTop: 22 }}>Bomberos voluntarios y bomberos de la policia</h2>
        <div className="grid3">
          {CUARTELES.map((c) => (
            <div key={c.nombre} className="tarjeta">
              <h3>{c.nombre}</h3>
              {c.direccion && <p>{c.direccion}</p>}
              {c.tel.map((t) => <a key={t.v} className="tel" style={{ fontSize: 17 }} href={`tel:${t.v}`}>{t.t}</a>)}
            </div>
          ))}
        </div>
        <p className="nota" style={{ marginTop: 14 }}>Numeros cargados por el equipo de ARGOS. Ante una emergencia, llamar siempre primero al 911 o al 100. Brigadas forestales y organismos provinciales: proximamente.</p>
      </div>
    </Shell>
  );
}
