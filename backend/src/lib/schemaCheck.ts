/**
 * Verificación de esquema al arrancar (correctivo de MG-080).
 *
 * `transactions.metadata` no existía en producción y la ingesta empezó a
 * devolver 500 sólo cuando un usuario intentaba cargar un movimiento. Este
 * chequeo es best-effort: nunca lanza, nunca bloquea el boot y nunca escribe
 * en la base. Sirve para que `/health` avise de una migración pendiente antes
 * de que la app se caiga.
 */

export type RequiredTable = { table: string; cols: string[] };

export const REQUIRED: RequiredTable[] = [
  { table: "transactions", cols: ["metadata", "dedup_key"] },
  { table: "raw_events", cols: ["metadata"] },
];

export type SchemaCheckResult = { ok: boolean; missing: string[] };

// `any[]` para aceptar tanto un logger casero como el pino de Fastify.
export type SchemaCheckLogger = { warn: (...args: any[]) => void };

// PostgREST/Postgres: columna inexistente (42703), columna fuera del schema
// cache (PGRST204) y tabla fuera del schema cache (PGRST205).
const MISSING_SCHEMA_CODES = new Set(["42703", "PGRST204", "PGRST205"]);

/**
 * Consulta cada columna requerida con `limit(1)`. Si falta, se acumula como
 * `tabla.columna` en `missing`.
 *
 * Ante un cliente nulo, un error de red o un error inesperado se devuelve
 * `{ ok: true, missing: [] }` con un warning: un fallo de verificación no es
 * evidencia de esquema roto y no debe pintar el health en rojo.
 */
export async function checkSchema(
  client: any,
  log?: SchemaCheckLogger
): Promise<SchemaCheckResult> {
  if (!client) {
    log?.warn("schemaCheck: sin cliente Supabase; se omite la verificación de esquema");
    return { ok: true, missing: [] };
  }

  const missing: string[] = [];

  for (const { table, cols } of REQUIRED) {
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];

      let error: any = null;
      try {
        const res = await client.from(table).select(col).limit(1);
        error = res?.error ?? null;
      } catch (err: any) {
        log?.warn(`schemaCheck: no se pudo verificar ${table}.${col}: ${err?.message ?? err}`);
        continue;
      }

      if (!error) continue;

      const code = String(error.code ?? "");
      if (!MISSING_SCHEMA_CODES.has(code)) {
        const detail = error.message ?? code ?? String(error);
        log?.warn(`schemaCheck: error inesperado verificando ${table}.${col}: ${detail}`);
        continue;
      }

      missing.push(`${table}.${col}`);

      // Tabla ausente del schema cache: faltan todas sus columnas, no tiene
      // sentido seguir consultándola.
      if (code === "PGRST205") {
        for (const rest of cols.slice(i + 1)) missing.push(`${table}.${rest}`);
        break;
      }
    }
  }

  return { ok: missing.length === 0, missing };
}
