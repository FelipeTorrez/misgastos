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
  parsed_is_transaction: boolean;
  [key: string]: any;
};

export type PendingSummary = {
  count: number;
  /** @deprecated Suma promos y créditos preaprobados. Usar `total_transactions`. */
  total: number;
  with_amount: number;
  /** Suma solo las filas cuyo texto parece un movimiento real de plata. */
  total_transactions: number;
  /** Filas con monto pero que son ofertas de crédito/promoción. */
  promos: number;
};

/**
 * Marcadores de oferta de crédito / promoción: el monto de esos correos no es
 * plata que se movió de una cuenta.
 */
const PROMO_MARKERS =
  /(simula|contratalo|contrátalo|solicita|preaprobad|referencial|cae\s*:|costo total|descuento|dcto|aprovecha|último d[ií]a|ultimo d[ií]a|participa|premio|invierte|tasa[^.]{0,20}%|\bcae\b|\bcuotas\b|sorteo|gratis|beneficio)/i;

/**
 * Default invertido a propósito: cuenta como transacción SALVO que el texto
 * traiga marcadores de promo. Subcontar plata real es peor que sobrecontar, y
 * los avisos de compra no siempre empiezan con el verbo — Google Wallet manda
 * "RedGloba*BREAK CLP 1,300 con CMR Mastercard Contactless".
 */
export function looksLikeTransaction(text: string): boolean {
  return !PROMO_MARKERS.test(text ?? "");
}

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
      parsed_is_transaction: looksLikeTransaction(
        typeof row?.raw_content === "string" ? row.raw_content : "",
      ),
    };
  });

  let total = 0; // OBSOLETO: incluye promos; conservado para no romper consumidores.
  let with_amount = 0;
  let total_transactions = 0;
  let promos = 0;
  for (const row of enriched) {
    if (typeof row.parsed_amount === "number" && row.parsed_amount > 0) {
      total += row.parsed_amount;
      with_amount += 1;
      if (row.parsed_is_transaction) total_transactions += row.parsed_amount;
      else promos += 1;
    }
  }

  return {
    rows: enriched,
    summary: { count: enriched.length, total, with_amount, total_transactions, promos },
  };
}
