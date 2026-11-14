"use client";

import { useEffect, useMemo, useState } from "react";
import Nav from "../../components/Nav";
import Barras from "../../components/Barras";
import { BANDAS, infoBanda } from "../../lib/bandas";
import { traerTodo } from "../../lib/datos";

type Mensual = { anio: number; mes: number; departamento: string; focos: number; focos_confiables: number; frp_total_mw: number | null; celdas_afectadas: number };
type Hora = { departamento: string; hora: number; focos: number };
type Escala = { banda: string; orden: number; frecuencia_observada: number | null; lift: number | null; frac_celdas_dia: number };
type Calib = { banda: string; orden: number; n: number; prometido: number | null; observado: number | null };

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MESES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export default function Estadisticas() {
  const [m, setM] = useState<Mensual[]>([]);
  const [h, setH] = useState<Hora[]>([]);
  const [escala, setEscala] = useState<Escala[]>([]);
  const [calib, setCalib] = useState<Calib[]>([]);
  const [depto, setDepto] = useState("Todos");
  const [anioR, setAnioR] = useState<number | null>(null);
  const [mesR, setMesR] = useState(8);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [a, b, c, d] = await Promise.all([
          traerTodo<Mensual>("stats_mensual", "anio,mes,departamento,focos,focos_confiables,frp_total_mw,celdas_afectadas"),
          traerTodo<Hora>("stats_hora", "departamento,hora,focos"),
          traerTodo<Escala>("escala_bandas", "banda,orden,frecuencia_observada,lift,frac_celdas_dia", [], "orden"),
          traerTodo<Calib>("calibracion_depto", "banda,orden,n,prometido,observado", [], "orden"),
        ]);
        setM(a); setH(b); setEscala(c); setCalib(d);
        if (a.length) setAnioR(Math.max(...a.map((x) => x.anio)));
      } catch (e: any) { setError(e?.message ?? "Error al leer Supabase"); }
    })();
  }, []);

  const deptos = useMemo(() => Array.from(new Set(m.map((x) => x.departamento))).sort(), [m]);
  const anios = useMemo(() => Array.from(new Set(m.map((x) => x.anio))).sort(), [m]);
  const f = useMemo(() => (depto === "Todos" ? m : m.filter((x) => x.departamento === depto)), [m, depto]);

  const porAnio = anios.map((a) => ({ etiqueta: String(a), valor: suma(f.filter((x) => x.anio === a).map((x) => x.focos)) }));
  const porMes = MESES.map((n, i) => ({ etiqueta: n, valor: suma(f.filter((x) => x.mes === i + 1).map((x) => x.focos)) }));
  const horas = useMemo(() => {
    const hh = depto === "Todos" ? h : h.filter((x) => x.departamento === depto);
    return Array.from({ length: 24 }, (_, i) => ({ etiqueta: String(i), valor: suma(hh.filter((x) => x.hora === i).map((x) => x.focos)) }));
  }, [h, depto]);
  const porDepto = deptos.map((d) => ({ etiqueta: d, valor: suma(m.filter((x) => x.departamento === d).map((x) => x.focos)) }))
    .sort((a, b) => b.valor - a.valor);

  const total = suma(f.map((x) => x.focos));
  const mesPico = porMes.reduce((a, b) => (b.valor > a.valor ? b : a), porMes[0] ?? { etiqueta: "-", valor: 0 });
  const anioPico = porAnio.reduce((a, b) => (b.valor > a.valor ? b : a), porAnio[0] ?? { etiqueta: "-", valor: 0 });
  const nocturnos = suma(horas.filter((x) => Number(x.etiqueta) >= 20 || Number(x.etiqueta) < 6).map((x) => x.valor));
  const totalH = suma(horas.map((x) => x.valor));

  const ranking = useMemo(() => {
    const r = deptos.map((d) => ({
      d, focos: suma(m.filter((x) => x.anio === anioR && x.mes === mesR && x.departamento === d).map((x) => x.focos)),
    })).sort((a, b) => b.focos - a.focos);
    return r.map((x, i) => ({ ...x, puesto: x.focos > 0 ? i + 1 : null }));
  }, [m, deptos, anioR, mesR]);

  function descargarCsv() {
    const filas = ["Año,Mes,Departamento,Cantidad de focos,Puesto del mes"];
    for (const a of anios) for (let mes = 1; mes <= 12; mes++) {
      const del = deptos.map((d) => ({ d, n: suma(m.filter((x) => x.anio === a && x.mes === mes && x.departamento === d).map((x) => x.focos)) }));
      if (del.every((x) => x.n === 0)) continue;
      const orden = [...del].sort((p, q) => q.n - p.n);
      for (const x of del) filas.push(`${a},${MESES_LARGO[mes - 1]},"${x.d}",${x.n},${x.n > 0 ? orden.findIndex((o) => o.n === x.n) + 1 : ""}`);
    }
    const blob = new Blob(["\ufeff" + filas.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "ranking_mensual_focos.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const pct = (x: number | null) => (x == null ? "s/d" : (x * 100).toFixed(1) + "%");

  return (
    <div className="pagina">
      <Nav activo="estadisticas" />
      <h1 className="titulo">Estadisticas e historial de focos</h1>
      <p className="sub">Focos de calor armonizados MODIS + VIIRS (NASA FIRMS), solo vegetacion, dentro de Catamarca. Un foco es una deteccion satelital, no una superficie quemada.</p>
      {error && <div className="msg">{error}</div>}

      <div className="filtro">
        <label>Departamento:{" "}
          <select value={depto} onChange={(e) => setDepto(e.target.value)}>
            <option>Todos</option>{deptos.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
      </div>

      <div className="kpis">
        <div className="kpi"><b>{total.toLocaleString("es-AR")}</b><span>focos en el historial</span></div>
        <div className="kpi"><b>{anioPico.etiqueta}</b><span>año con mas focos ({anioPico.valor.toLocaleString("es-AR")})</span></div>
        <div className="kpi"><b>{mesPico.etiqueta}</b><span>mes pico</span></div>
        <div className="kpi"><b>{totalH ? Math.round((nocturnos / totalH) * 100) : 0}%</b><span>detectados de noche (20 a 6 h)</span></div>
      </div>

      <section className="card"><h2>Focos por año</h2><Barras datos={porAnio} /></section>
      <section className="card"><h2>Estacionalidad (todos los años)</h2><Barras datos={porMes} color="#fb923c" /></section>
      <section className="card"><h2>Hora local de deteccion</h2>
        <Barras datos={horas} color="#facc15" />
        <p className="nota">Las horas dependen de los pasos de cada satelite. Sirve para ver el patron, no para fechar el inicio del fuego.</p>
      </section>
      <section className="card"><h2>Por departamento (historial completo)</h2><Barras datos={porDepto.map((d) => ({ ...d, destacado: d.etiqueta === depto }))} color="#ea580c" alto={190} /></section>

      <section className="card">
        <h2>Ranking mensual por departamento</h2>
        <div className="filtro">
          <select value={anioR ?? ""} onChange={(e) => setAnioR(Number(e.target.value))}>{anios.map((a) => <option key={a}>{a}</option>)}</select>{" "}
          <select value={mesR} onChange={(e) => setMesR(Number(e.target.value))}>{MESES_LARGO.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select>{" "}
          <button className="btn" onClick={descargarCsv}>Descargar CSV completo</button>
        </div>
        <table className="tabla">
          <thead><tr><th>Puesto</th><th>Departamento</th><th>Focos</th></tr></thead>
          <tbody>{ranking.map((r) => <tr key={r.d}><td>{r.puesto ?? "-"}</td><td>{r.d}</td><td>{r.focos}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="card">
        <h2>Cuanto confiar en la escala</h2>
        <p className="nota">Medido en datos que el modelo nunca vio (2024 en adelante).</p>
        {escala.length > 0 && (
          <table className="tabla">
            <thead><tr><th>Banda de celda</th><th>% de celdas-dia</th><th>Tuvo fuego en 7 d</th><th>Veces la frecuencia base</th></tr></thead>
            <tbody>{escala.map((e) => (
              <tr key={e.banda}><td><i className="dot" style={{ background: infoBanda(e.banda).color }} />{infoBanda(e.banda).label}</td>
                <td>{pct(e.frac_celdas_dia)}</td><td>{pct(e.frecuencia_observada)}</td><td>{e.lift ?? "s/d"}</td></tr>))}</tbody>
          </table>)}
        {calib.length > 0 && (
          <>
            <h3 className="h3">Probabilidad por departamento: prometido vs observado</h3>
            <table className="tabla">
              <thead><tr><th>Banda</th><th>Casos</th><th>Prometido</th><th>Observado</th></tr></thead>
              <tbody>{calib.filter((c) => c.n > 0).map((c) => (
                <tr key={c.banda}><td><i className="dot" style={{ background: infoBanda(c.banda).color }} />{infoBanda(c.banda).label}</td>
                  <td>{c.n}</td><td>{pct(c.prometido)}</td><td>{pct(c.observado)}</td></tr>))}</tbody>
            </table>
          </>
        )}
        <div className="leyenda" style={{ marginTop: 12 }}>
          {BANDAS.map((b) => <div key={b.id} className="lchip" style={{ background: b.color, color: b.id === "amarillo" ? "#111" : "#fff" }}><span>{b.label}</span><span>{b.desde}-{b.hasta}</span></div>)}
        </div>
      </section>
    </div>
  );
}
