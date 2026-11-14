import { getSupabase } from "./supabase";

type Filtro = [string, string | number];

/** Trae todas las filas de una tabla en paginas de 1000 (limite de Supabase por pedido). */
export async function traerTodo<T>(tabla: string, columnas: string, filtros: Filtro[] = [], orden?: string): Promise<T[]> {
  const sb = getSupabase();
  if (!sb) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  const out: T[] = [];
  const paso = 1000;
  for (let desde = 0; ; desde += paso) {
    let q = sb.from(tabla).select(columnas);
    for (const [c, v] of filtros) q = q.eq(c, v);
    if (orden) q = q.order(orden);
    const { data, error } = await q.range(desde, desde + paso - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < paso) break;
  }
  return out;
}
