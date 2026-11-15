"use client";

import { useEffect, useMemo, useState } from "react";
import Barras from "./Barras";
import { traerTodo } from "../lib/datos";
import { num } from "../lib/formato";

type Clima = {
  fecha: string; departamento: string; temp_c: number | null; temp_max_c: number | null; humedad_pct: number | null;
  viento_kmh: number | null; precip_mm: number | null; dias_sin_lluvia: number | null; precip_30d: number | null;
  vpd_kpa: number | null; temp_anom: number | null; humedad_anom: number | null;
};

const TODA = "Toda la provincia";
const signo = (x: number | null | undefined, d = 1) => (x == null ? "s/d" : (x > 0 ? "+" : "") + num(x, d));

export default function Ambiente() {
  const [datos, setDatos] = useState<Clima[]>([]);
  const [depto, setDepto] = useState(TODA);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    traerTodo<Clima>("clima_actual", "fecha,departamento,temp_c,temp_max_c,humedad_pct,viento_kmh,precip_mm,dias_sin_lluvia,precip_30d,vpd_kpa,temp_anom,humedad_anom", [], "fecha")
      .then(setDatos).catch((e) => setError(e?.message ?? "No se pudo leer el clima"));
  }, []);

  const deptos = useMemo(() => Array.from(new Set(datos.map((d) => d.departamento))).filter((d) => d !== TODA).sort(), [datos]);
  const serie = useMemo(() => datos.filter((d) => d.departamento === depto).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)), [datos, depto]);
  const hoy = serie[serie.length - 1];
  const et = (f: string) => f.slice(8, 10) + "/" + f.slice(5, 7);

  if (error) return <div className="msg">{error}</div>;
  if (!hoy) return <p className="nota">Todavia no hay clima cargado.</p>;

  return (
    <>
      <div className="filtro">
        <label>Zona: <select value={depto} onChange={(e) => setDepto(e.target.value)}>
          <option>{TODA}</option>{deptos.map((d) => <option key={d}>{d}</option>)}
        </select></label>
        {" "}<span className="nota">Datos NASA POWER al {hoy.fecha.split("-").reverse().join("/")}. El clima se publica con 3 a 5 dias de retraso.</span>
      </div>
      <div className="grid4">
        <div className="bloque"><h3>Temperatura</h3><div className="v">{num(hoy.temp_c, 1)} °C</div>
          <p>Maxima {num(hoy.temp_max_c, 1)} °C. {signo(hoy.temp_anom)} °C respecto de lo normal para la fecha.</p></div>
        <div className="bloque"><h3>Viento</h3><div className="v">{num(hoy.viento_kmh, 1)} km/h</div>
          <p>Promedio del dia en una grilla de ~50 km. No incluye rafagas ni direccion.</p></div>
        <div className="bloque"><h3>Humedad relativa</h3><div className="v">{num(hoy.humedad_pct, 0)} %</div>
          <p>{signo(hoy.humedad_anom, 0)} puntos respecto de lo normal. Deficit de vapor {num(hoy.vpd_kpa, 2)} kPa (mayor es aire mas seco).</p></div>
        <div className="bloque"><h3>Precipitaciones</h3><div className="v">{num(hoy.precip_mm, 1)} mm</div>
          <p>{num(hoy.precip_30d, 0)} mm en 30 dias. {num(hoy.dias_sin_lluvia, 0)} dias seguidos sin lluvia.</p></div>
      </div>
      <div className="grid3" style={{ marginTop: 14 }}>
        <div><h3 className="h3">Temperatura maxima, ultimos dias (°C)</h3>
          <Barras datos={serie.map((s) => ({ etiqueta: et(s.fecha), valor: s.temp_max_c ?? 0 }))} alto={90} /></div>
        <div><h3 className="h3">Humedad relativa (%)</h3>
          <Barras datos={serie.map((s) => ({ etiqueta: et(s.fecha), valor: s.humedad_pct ?? 0 }))} color="#AEB6BD" alto={90} /></div>
        <div><h3 className="h3">Lluvia diaria (mm)</h3>
          <Barras datos={serie.map((s) => ({ etiqueta: et(s.fecha), valor: s.precip_mm ?? 0 }))} color="#FF813C" alto={90} /></div>
      </div>
    </>
  );
}
