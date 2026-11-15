"use client";

import { useEffect, useMemo, useState } from "react";
import Barras from "./Barras";
import { traerTodo } from "../lib/datos";
import { num } from "../lib/formato";
import { useIdioma } from "../lib/i18n";

type Clima = {
  fecha: string; departamento: string; temp_c: number | null; temp_max_c: number | null; humedad_pct: number | null;
  viento_kmh: number | null; precip_mm: number | null; dias_sin_lluvia: number | null; precip_30d: number | null;
  vpd_kpa: number | null; temp_anom: number | null; humedad_anom: number | null;
};

const TODA = "Toda la provincia";
const signo = (x: number | null | undefined, d = 1) => (x == null ? "n/a" : (x > 0 ? "+" : "") + num(x, d));

export default function Ambiente() {
  const { tr } = useIdioma();
  const [datos, setDatos] = useState<Clima[]>([]);
  const [depto, setDepto] = useState(TODA);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    traerTodo<Clima>("clima_actual", "fecha,departamento,temp_c,temp_max_c,humedad_pct,viento_kmh,precip_mm,dias_sin_lluvia,precip_30d,vpd_kpa,temp_anom,humedad_anom", [], "fecha")
      .then(setDatos).catch((e) => setError(e?.message ?? tr("No se pudo leer el clima", "Could not read the weather data")));
  }, []);

  const deptos = useMemo(() => Array.from(new Set(datos.map((d) => d.departamento))).filter((d) => d !== TODA).sort(), [datos]);
  const serie = useMemo(() => datos.filter((d) => d.departamento === depto).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)), [datos, depto]);
  const hoy = serie[serie.length - 1];
  const et = (f: string) => f.slice(8, 10) + "/" + f.slice(5, 7);

  if (error) return <div className="msg">{error}</div>;
  if (!hoy) return <p className="nota">{tr("Todavía no hay clima cargado.", "No weather data loaded yet.")}</p>;

  return (
    <>
      <div className="filtro">
        <label>{tr("Zona", "Area")}: <select value={depto} onChange={(e) => setDepto(e.target.value)}>
          <option value={TODA}>{tr("Toda la provincia", "Whole province")}</option>{deptos.map((d) => <option key={d}>{d}</option>)}
        </select></label>
        {" "}<span className="nota">{tr("Datos NASA POWER al", "NASA POWER data as of")} {hoy.fecha.split("-").reverse().join("/")}. {tr("El clima se publica con 3 a 5 días de retraso.", "Weather is published with a 3 to 5 day delay.")}</span>
      </div>
      <div className="grid4">
        <div className="bloque"><h3>{tr("Temperatura", "Temperature")}</h3><div className="v">{num(hoy.temp_c, 1)} °C</div>
          <p>{tr("Máxima", "Max")} {num(hoy.temp_max_c, 1)} °C. {signo(hoy.temp_anom)} °C {tr("respecto de lo normal para la fecha.", "vs normal for the date.")}</p></div>
        <div className="bloque"><h3>{tr("Viento", "Wind")}</h3><div className="v">{num(hoy.viento_kmh, 1)} km/h</div>
          <p>{tr("Promedio del día en una grilla de ~50 km. No incluye rafagas ni dirección.", "Daily mean on a ~50 km grid. Gusts and direction not included.")}</p></div>
        <div className="bloque"><h3>{tr("Humedad relativa", "Relative humidity")}</h3><div className="v">{num(hoy.humedad_pct, 0)} %</div>
          <p>{signo(hoy.humedad_anom, 0)} {tr("puntos respecto de lo normal. Déficit de vapor", "points vs normal. Vapor pressure deficit")} {num(hoy.vpd_kpa, 2)} kPa {tr("(mayor es aire más seco).", "(higher means drier air).")}</p></div>
        <div className="bloque"><h3>{tr("Precipitaciones", "Precipitation")}</h3><div className="v">{num(hoy.precip_mm, 1)} mm</div>
          <p>{num(hoy.precip_30d, 0)} {tr("mm en 30 días.", "mm in 30 days.")} {num(hoy.dias_sin_lluvia, 0)} {tr("días seguidos sin lluvia.", "consecutive days without rain.")}</p></div>
      </div>
      <div className="grid3" style={{ marginTop: 14 }}>
        <div><h3 className="h3">{tr("Temperatura máxima, últimos días (°C)", "Max temperature, last days (°C)")}</h3>
          <Barras datos={serie.map((s) => ({ etiqueta: et(s.fecha), valor: s.temp_max_c ?? 0 }))} alto={90} /></div>
        <div><h3 className="h3">{tr("Humedad relativa (%)", "Relative humidity (%)")}</h3>
          <Barras datos={serie.map((s) => ({ etiqueta: et(s.fecha), valor: s.humedad_pct ?? 0 }))} color="#AEB6BD" alto={90} /></div>
        <div><h3 className="h3">{tr("Lluvia diaria (mm)", "Daily rainfall (mm)")}</h3>
          <Barras datos={serie.map((s) => ({ etiqueta: et(s.fecha), valor: s.precip_mm ?? 0 }))} color="#FF813C" alto={90} /></div>
      </div>
    </>
  );
}
