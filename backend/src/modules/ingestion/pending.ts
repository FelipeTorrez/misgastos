/**
 * Enriquecimiento de raw_events pending (sin transacción) con lo que el
 * parser determinístico §14 ya puede leer del correo crudo: monto, comercio
 * y fecha. Permite saber cuánto dinero falta conciliar sin abrir cada correo.
 *
 * Puro: no toca Supabase ni el mockStore.
 */
import { parseEmail } from "./parser.js";

export type PendingRow = {
  raw_content?: string | null;
  parsed_amount: number | null;
  parsed_merchant: string | null;
  parsed_date: string | null;
  [key: string]: any;
};

export type PendingSummary = {
  count: number;
  total: number;
  with_amount: number;
};

export type PendingEnriched = {
  rows: PendingRow[];
  summary: PendingSummary;
};

/** Agrega parsed_amount / parsed_merchant / parsed_date a cada raw_event. */
export function enrichPending(rows: any[]): PendingEnriched {
  const enriched: PendingRow[] = (rows ?? []).map((row) => {
    let parsed: ReturnType<typeof parseEmail> | null = null;
    try {
      if (typeof row?.raw_content === "string" && row.raw_content.length > 0) {
        parsed = parseEmail(row.raw_content);
      }
    } catch {
      // Un raw_content raro (promo vacía, texto exótico) nunca debe romper el listado.
      parsed = null;
    }
    return {
      ...row,
      parsed_amount: parsed?.amount ?? null,
      parsed_merchant: parsed?.merchant ?? null,
      parsed_date: parsed?.date ?? null,
    };
  });

  let total = 0;
  let with_amount = 0;
  for (const row of enriched) {
    if (typeof row.parsed_amount === "number" && row.parsed_amount > 0) {
      total += row.parsed_amount;
      with_amount += 1;
    }
  }

  return { rows: enriched, summary: { count: enriched.length, total, with_amount } };
}
