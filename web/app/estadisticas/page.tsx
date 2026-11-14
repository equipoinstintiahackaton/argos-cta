"use client";

import { useEffect, useMemo, useState } from "react";
import Nav from "../../components/Nav";
import Barras from "../../components/Barras";
import { BANDAS, infoBanda } from "../../lib/bandas";
import { traerTodo } from "../../lib/datos";

type Mensual = { anio: number; mes: number; departamento: string; focos: number; focos_confiables: number; frp_total_mw: number | null; celdas_afectadas: number };
type Hora = { departamento: string; hora: number; focos: number };
type Escala = { banda: string; orden: number; frecuencia_observada: number | null; lift: number | null; frac_celdas_dia: number };
type Cond = { variable: string; grupo: "foco" | "base"; n: number; media: number; p10: number; p25: number; p50: number; p75: number; p90: number };
type Aud = { orden: number; chequeo: string; estado: "ok" | "aviso" | "error"; detalle: string };
type Bt = { anio: number; modelo: string; positivos: number; pr_auc: number; recall_top5: number | null; recall_top10: number | null; lift_top5: number | null; brier: number | null };
type Calib = { banda: string; orden: number; n: number; prometido: number | null; observado: number | null };

const VARS: { id: string; label: string; unidad: string }[] = [
  { id: "temp_max_c", label: "Temperatura maxima", unidad: "C" },
  { id: "temp_c", label: "Temperatura media", unidad: "C" },
  { id: "humedad_pct", label: "Humedad relativa", unidad: "%" },
  { id: "vpd_kpa", label: "Deficit de vapor (aire seco)", unidad: "kPa" },
  { id: "viento_kmh", label: "Viento", unidad: "km/h" },
  { id: "dias_sin_lluvia", label: "Dias sin lluvia", unidad: "dias" },
  { id: "precip_30d", label: "Lluvia acumulada 30 dias", unidad: "mm" },
  { id: "precip_90d", label: "Lluvia acumulada 90 dias", unidad: "mm" },
  { id: "temp_anom", label: "Anomalia de temperatura", unidad: "C" },
  { id: "humedad_anom", label: "Anomalia de humedad", unidad: "puntos" },
];

function Rango({ foco, base }: { foco: Cond; base: Cond }) {
  const lo = Math.min(foco.p10, base.p10), hi = Math.max(foco.p90, base.p90);
  const W = 260, x = (v: number) => 4 + ((v - lo) / Math.max(1e-9, hi - lo)) * (W - 8);
  const fila = (c: Cond, y: number, color: string) => (
    <g>
      <line x1={x(c.p10)} x2={x(c.p90)} y1={y} y2={y} stroke={color} strokeWidth={2} />
      <rect x={x(c.p25)} y={y - 6} width={Math.max(2, x(c.p75) - x(c.p25))} height={12} fill={color} opacity={0.55} />
      <line x1={x(c.p50)} x2={x(c.p50)} y1={y - 8} y2={y + 8} stroke="#fff" strokeWidth={2} />
    </g>
  );
  return (
    <svg viewBox={`0 0 ${W} 40`} width={W} className="rango">
      {fila(foco, 10, "#ea580c")}
      {fila(base, 30, "#64748b")}
    </svg>
  );
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MESES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export default function Estadisticas() {
  const [m, setM] = useState<Mensual[]>([]);
  const [h, setH] = useState<Hora[]>([]);
  const [escala, setEscala] = useState<Escala[]>([]);
  const [calib, setCalib] = useState<Calib[]>([]);
  const [cond, setCond] = useState<Cond[]>([]);
  const [aud, setAud] = useState<Aud[]>([]);
  const [bt, setBt] = useState<Bt[]>([]);
  const [depto, setDepto] = useState("Todos");
  const [anioR, setAnioR] = useState<number | null>(null);
  const [mesR, setMesR] = useState(8);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [a, b, c, d, e5, e6, e7] = await Promise.all([
          traerTodo<Mensual>("stats_mensual", "anio,mes,departamento,focos,focos_confiables,frp_total_mw,celdas_afectadas"),
          traerTodo<Hora>("stats_hora", "departamento,hora,focos"),
          traerTodo<Escala>("escala_bandas", "banda,orden,frecuencia_observada,lift,frac_celdas_dia", [], "orden"),
          traerTodo<Calib>("calibracion_depto", "banda,orden,n,prometido,observado", [], "orden"),
          traerTodo<Cond>("condiciones_focos", "variable,grupo,n,media,p10,p25,p50,p75,p90"),
          traerTodo<Aud>("auditoria", "orden,chequeo,estado,detalle", [], "orden"),
          traerTodo<Bt>("backtest", "anio,modelo,positivos,pr_auc,recall_top5,recall_top10,lift_top5,brier", [], "anio"),
        ]);
        setM(a); setH(b); setEscala(c); setCalib(d); setCond(e5); setAud(e6); setBt(e7);
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

  const NOMBRES_MODELO: Record<string, string> = {
    modelo: "Modelo ARGOS (machine learning)", clim_celda_mes: "Historial de la celda en ese mes",
    historial_celda: "Historial total de la celda", fuego_7d: "Focos de la ultima semana",
  };
  const aniosBt = useMemo(() => Array.from(new Set(bt.map((x) => x.anio))).sort(), [bt]);
  const modelosBt = ["modelo", "clim_celda_mes", "historial_celda", "fuego_7d"];
  const prom = (mod: string, k: "pr_auc" | "recall_top5" | "recall_top10" | "lift_top5") => {
    const v = bt.filter((x) => x.modelo === mod).map((x) => x[k]).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const gana = aniosBt.filter((a) => {
    const fila = (mod: string) => bt.find((x) => x.anio === a && x.modelo === mod)?.pr_auc ?? 0;
    return fila("modelo") > Math.max(fila("clim_celda_mes"), fila("historial_celda"), fila("fuego_7d"));
  }).length;
  const colorEstado = { ok: "#22c55e", aviso: "#eab308", error: "#ef4444" } as const;

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
      {cond.length > 0 && (
        <section className="card">
          <h2>Condiciones que acompañaron a los focos</h2>
          <p className="nota">
            Clima de los dias con focos (naranja) contra dias sin focos de los mismos meses (gris). La barra muestra el rango
            entre el percentil 10 y 90, la caja entre el 25 y el 75, y la marca blanca la mediana.
            Si las barras se superponen mucho, esa variable por si sola distingue poco: el modelo las combina con el historial de fuego.
          </p>
          <table className="tabla">
            <thead><tr><th>Variable</th><th>Con foco (mediana)</th><th>Sin foco (mediana)</th><th>Rango</th></tr></thead>
            <tbody>
              {VARS.map((v) => {
                const fo = cond.find((c) => c.variable === v.id && c.grupo === "foco");
                const ba = cond.find((c) => c.variable === v.id && c.grupo === "base");
                if (!fo || !ba) return null;
                const f1 = (x: number) => x.toLocaleString("es-AR", { maximumFractionDigits: 1 });
                return (
                  <tr key={v.id}>
                    <td>{v.label} ({v.unidad})</td>
                    <td>{f1(fo.p50)}</td><td>{f1(ba.p50)}</td>
                    <td><Rango foco={fo} base={ba} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="nota">Dias con foco: {cond[0] ? cond.find((c) => c.grupo === "foco")?.n.toLocaleString("es-AR") : 0}. Clima: NASA POWER (grilla de ~50 km), por lo que describe la region, no el sitio exacto del foco.</p>
        </section>
      )}

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
        <h2>Backtesting: el modelo contra no usar machine learning</h2>
        <p className="nota">Para cada año se entrena solo con datos anteriores y se evalua en ese año. Se compara contra reglas simples sin aprendizaje. Recall 5%: que parte de los focos reales cae dentro del 5% de celdas-dia con mayor puntaje.</p>
        {bt.length === 0 ? <p className="nota">Todavia no hay backtest cargado.</p> : (
          <>
            <table className="tabla">
              <thead><tr><th>Metodo</th><th>PR-AUC medio</th><th>Recall 5%</th><th>Recall 10%</th><th>Lift 5%</th></tr></thead>
              <tbody>{modelosBt.map((mo) => (
                <tr key={mo} style={mo === "modelo" ? { fontWeight: 700 } : undefined}>
                  <td>{NOMBRES_MODELO[mo]}</td>
                  <td>{prom(mo, "pr_auc")?.toFixed(3) ?? "s/d"}</td><td>{pct(prom(mo, "recall_top5"))}</td>
                  <td>{pct(prom(mo, "recall_top10"))}</td><td>{prom(mo, "lift_top5")?.toFixed(1) ?? "s/d"}</td></tr>))}</tbody>
            </table>
            <p className="nota" style={{ marginTop: 8 }}>El modelo supera al mejor metodo simple (PR-AUC) en {gana} de {aniosBt.length} años evaluados.</p>
            <h3 className="h3">PR-AUC por año</h3>
            <table className="tabla">
              <thead><tr><th>Año</th><th>Focos</th>{modelosBt.map((mo) => <th key={mo}>{mo === "modelo" ? "Modelo" : mo === "clim_celda_mes" ? "Celda-mes" : mo === "historial_celda" ? "Historial" : "7 dias"}</th>)}</tr></thead>
              <tbody>{aniosBt.map((a) => (
                <tr key={a}><td>{a}</td><td>{bt.find((x) => x.anio === a)?.positivos}</td>
                  {modelosBt.map((mo) => <td key={mo}>{bt.find((x) => x.anio === a && x.modelo === mo)?.pr_auc.toFixed(3) ?? "s/d"}</td>)}</tr>))}</tbody>
            </table>
          </>)}
      </section>

      <section className="card">
        <h2>Calidad de los datos</h2>
        <p className="nota">Chequeos automaticos sobre los focos NASA FIRMS (MODIS y VIIRS) y el clima NASA POWER. Un aviso es una limitacion a tener en cuenta; un error invalida el dato.</p>
        {aud.length === 0 ? <p className="nota">Todavia no hay auditoria cargada.</p> : (
          <table className="tabla">
            <tbody>{aud.map((c) => (
              <tr key={c.orden}><td style={{ whiteSpace: "nowrap" }}><i className="dot" style={{ background: colorEstado[c.estado] }} />{c.chequeo}</td><td>{c.detalle}</td></tr>))}</tbody>
          </table>)}
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
