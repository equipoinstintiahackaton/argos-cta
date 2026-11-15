"use client";

import Shell from "../../components/Shell";


export default function Pagina() {
  return (
    <Shell activo="instituciones">
      <div className="pagina">
        <h1 className="titulo">Organismos y equipos de emergencia</h1>
        <p className="sub">Espacio para integrar contactos y comunicados verificados de quienes trabajan en la prevencion y el combate de incendios en Catamarca.</p>
        <div className="grid4">
          <div className="tarjeta"><h3>Bomberos</h3><p>Cuarteles, contactos y reportes institucionales.</p><span className="tel">100</span></div>
          <div className="tarjeta"><h3>Emergencias</h3><p>Linea nacional de emergencias.</p><span className="tel">911</span></div>
          <div className="tarjeta"><h3>Bomberos voluntarios <span className="proximo">proximamente</span></h3><p>Asociaciones y servicios de bomberos voluntarios.</p></div>
          <div className="tarjeta"><h3>Brigadas y organismos <span className="proximo">proximamente</span></h3><p>Brigadas forestales y organismos provinciales: comunicados y datos oficiales.</p></div>
        </div>
      </div>
    </Shell>
  );
}
