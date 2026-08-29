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

// $32.990, $45.000, $45000, CLP1,250, CLP 1.300 — CLP sin decimales
function extractAmount(text: string): number | null {
  // Prioridad: con separadores -> plain. Soporta $ / CLP / monto / importe. CLP con coma miles chilena (1,250)
  const m = text.match(/(?:\$|CLP\s*|monto:?|importe:?)\s*([0-9]{1,3}(?:[.,][0-9]{3})+(?:,[0-9]{2})?|[0-9]{4,7}(?:,[0-9]{2})?)/i)
    ?? text.match(/(?:\$|CLP\s*|monto:?|importe:?)\s*([0-9]+)/i);
  if (!m) return null;
  // Normaliza miles: quita . y , aisladas de miles; preserva ,xx decimales solo si es cola decimal
  let raw = m[1];
  // Si es formato 1,250 (coma miles 3 dígitos, sin decimales de 2), quitar comas
  if (/^[0-9]{1,3}(?:,[0-9]{3})+$/.test(raw)) raw = raw.replace(/,/g, "");
  else raw = raw.replace(/\./g, "").replace(/,[0-9]{2}$/, "").replace(/,/g, "");
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
  const stop = new Set(["con", "tarjeta", "terminada", "en", "de", "la", "el", "por", "para", "del", "los", "las", "un", "una", "su", "on", "a", "al", "o", "y"]);
  // Patrón promo "en 3 o 6 cuotas" no es comercio — debe ignorarse
  const isCuotasPromo = (s: string) => /^\d+(\s+o(\s+\d+)?)?$/i.test(s.trim()) || /cuotas/i.test(s);
  const isNumericNoise = (words: string[]) => words.length > 0 && words.every(w => /^\d+$/.test(w) || w.length === 1);
  let m = text.match(/\ben\s+([A-Za-zÁÉÍÓÚÑa-záéíóúñ0-9]+(?:\s+[A-Za-z0-9ÁÉÍÓÚÑa-záéíóúñ]+)?)/i);
  if (m) {
    const cand = m[1].trim();
    if (isCuotasPromo(cand)) {
      // Buscar siguiente "en <comercio>" que no sea promo numérica
      const rest = text.slice((m.index ?? 0) + m[0].length);
      const m2 = rest.match(/\ben\s+([A-Za-zÁÉÍÓÚÑa-záéíóúñ0-9]+(?:\s+[A-Za-z0-9ÁÉÍÓÚÑa-záéíóúñ]+)?)/i);
      if (m2) {
        const cand2 = m2[1].trim();
        if (!isCuotasPromo(cand2)) {
          const words2 = cand2.split(/\s+/).filter(w => !stop.has(w.toLowerCase()));
          if (words2.length && !isNumericNoise(words2)) return words2.slice(0, 2).join(" ");
        }
      }
      // fallback a "comercio:"
      const cm = text.match(/comercio:?\s*([A-Za-z0-9 ]{3,30})/i);
      if (cm) return cm[1].trim().split(/\s+/).slice(0,2).join(" ");
      return null;
    }
    const words = cand.split(/\s+/).filter(w => !stop.has(w.toLowerCase()));
    if (words.length && isNumericNoise(words)) return null;
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
