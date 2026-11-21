export function normText(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Solo los dígitos de un monto: 12990 ("12.990" → "12990"). */
export function amountDigits(n: unknown): string {
  return String(n ?? "").replace(/\D/g, "");
}

/** "12990" → "12.990" (punto de miles, es-CL). */
function thousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function filterTxs<
  T extends { merchant?: unknown; counterparty?: unknown; amount?: unknown },
>(txs: T[], query: string): T[] {
  const tokens = normText(query ?? "")
    .split(" ")
    .filter(Boolean);
  if (tokens.length === 0) return txs;
  return txs.filter((tx) => {
    const digits = amountDigits(tx.amount);
    const haystack = `${normText(String(tx.merchant ?? ""))} ${normText(String(tx.counterparty ?? ""))} ${digits} ${thousands(digits)}`;
    return tokens.every((tok) => {
      // Regla numérica: un token compuesto solo por dígitos/separadores (ej. "12990"
      // o "12.990") matchea por PREFIJO de los dígitos del monto — "12" sí matchea
      // 12990, pero "99" no, porque 12990 no empieza con 99.
      const tokDigits = amountDigits(tok);
      if (tokDigits.length > 0 && tokDigits === tok.replace(/[\s.,]/g, "")) {
        return digits.length > 0 && digits.startsWith(tokDigits);
      }
      return haystack.includes(tok);
    });
  });
}
