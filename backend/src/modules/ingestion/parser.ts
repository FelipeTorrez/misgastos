/**
 * Parser determinístico §14 — sin IA, reduce costo y mejora consistencia.
 * Extrae: monto, fecha, hora, banco, tarjeta last4, comercio, tipo operación, moneda
 */

export type Parsed = {
  amount: number | null; // CLP entero
  currency: "CLP" | null;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM
  bank: string | null;
  last4: string | null;
  merchant: string | null;
  operation: "purchase" | "transfer" | "withdrawal" | "unknown";
  confidence: number; // 0-1 heurístico
};

const BANKS = ["BancoEstado", "BCI", "Santander", "Itaú", "Scotiabank", "Banco de Chile", "Falabella", "Ripley", "Tenpo", "Mach"];

// $32.990, $45.000, $45000, $ 250.000, $600.000, $1.000.000 — CLP sin decimales
function extractAmount(text: string): number | null {
  // Prioridad: con puntos (requiere al menos un punto) -> sin puntos (plain). Evita que $45000 se capture como 450
  const m = text.match(/(?:\$|monto:?|importe:?)\s*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{2})?|[0-9]{4,7}(?:,[0-9]{2})?)/i)
    ?? text.match(/(?:\$|monto:?|importe:?)\s*([0-9]+)/i);
  if (!m) return null;
  const raw = m[1].replace(/\./g, "").replace(/,[0-9]{2}$/, "");
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractDate(text: string): string | null {
  // 24/08/2026, 2026-08-24, 24-08-2026
  let m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const d = m[1].padStart(2, "0"), mo = m[2].padStart(2, "0"), y = m[3];
    return `${y}-${mo}-${d}`;
  }
  m = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = text.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  return null;
}

function extractTime(text: string): string | null {
  const m = text.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:hrs?)?/i);
  if (!m) return null;
  return `${m[1].padStart(2,"0")}:${m[2]}`;
}

function extractBank(text: string): string | null {
  const low = text.toLowerCase();
  for (const b of BANKS) if (low.includes(b.toLowerCase())) return b;
  return null;
}

function extractLast4(text: string): string | null {
  const m = text.match(/(?:terminada en|tarjeta \*+|tarjeta terminada|xxxx)\s*(\d{4})/i)
    ?? text.match(/\*+(\d{4})/);
  return m ? m[1] : null;
}

function extractMerchant(text: string): string | null {
  // "en Lider", "comercio: Jumbo" — captura 1-2 palabras, corta antes de stopwords
  const stop = new Set(["con", "tarjeta", "terminada", "en", "de", "la", "el", "por", "para", "del", "los", "las", "un", "una", "su", "on", "a", "al"]);
  let m = text.match(/\ben\s+([A-Za-zÁÉÍÓÚÑa-záéíóúñ0-9]+(?:\s+[A-Za-z0-9ÁÉÍÓÚÑa-záéíóúñ]+)?)/i);
  if (m) {
    const words = m[1].trim().split(/\s+/).filter(w => !stop.has(w.toLowerCase()));
    if (words.length) return words.slice(0, 2).join(" ");
  }
  m = text.match(/comercio:?\s*([A-Za-z0-9 ]{3,30})/i);
  if (m) return m[1].trim().split(/\s+/).slice(0,2).join(" ");
  return null;
}

function detectOperation(text: string): Parsed["operation"] {
  const low = text.toLowerCase();
  if (/(transferencia|te han transferido|recibiste)/.test(low)) return "transfer";
  if (/(giro|cajero|retiro)/.test(low)) return "withdrawal";
  if (/(compra|pagaste|consumo)/.test(low)) return "purchase";
  return "unknown";
}

export function parseEmail(text: string): Parsed {
  const amount = extractAmount(text);
  const date = extractDate(text);
  const time = extractTime(text);
  const bank = extractBank(text);
  const last4 = extractLast4(text);
  const merchant = extractMerchant(text);
  const operation = detectOperation(text);
  let confidence = 0.5;
  if (amount) confidence += 0.2;
  if (date) confidence += 0.15;
  if (merchant) confidence += 0.15;
  if (bank) confidence += 0.05;
  confidence = Math.min(1, confidence);
  return { amount, currency: amount ? "CLP" : null, date, time, bank, last4, merchant, operation, confidence };
}

// Normaliza texto bruto para IA (500 chars, lower, sin RUT) — placeholder [RUT] queda en mayúsculas
export function normalizeForAI(raw: string): string {
  const lowered = raw.toLowerCase();
  const masked = lowered
    .replace(/\b\d{1,2}\.\d{3}\.\d{3}-[\dk]\b/g, "[RUT]")
    .replace(/\b\d{16}\b/g, "[CARD]");
  return masked.slice(0, 500).trim();
}

export const __test__ = { extractAmount, extractDate, extractTime, extractBank, extractLast4, extractMerchant, detectOperation };
