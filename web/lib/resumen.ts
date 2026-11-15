import { getSupabase } from "./supabase";

/** Cantidad de filas de una tabla (sin traerlas). null si no se pudo leer. */
export async function contar(tabla: string, filtro?: (q: any) => any): Promise<number | null> {
  const sb = getSupabase();
  if (!sb) return null;
  let q: any = sb.from(tabla).select("*", { count: "exact", head: true });
  if (filtro) q = filtro(q);
  const { count, error } = await q;
  return error ? null : count;
}

/** Fecha y hora (UTC, ISO) del foco mas reciente. */
export async function ultimoFoco(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("focos_vista").select("ts_utc").order("ts_utc", { ascending: false }).limit(1);
  return data?.[0]?.ts_utc ?? null;
}

/** Fecha mas reciente con alertas cargadas. */
export async function ultimaFechaAlertas(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("alertas").select("fecha").order("fecha", { ascending: false }).limit(1);
  return data?.[0]?.fecha ?? null;
}
