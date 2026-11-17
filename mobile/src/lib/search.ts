export function normText(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function filterTxs<T extends { merchant?: unknown; counterparty?: unknown }>(
  txs: T[],
  query: string,
): T[] {
  const tokens = normText(query ?? "")
    .split(" ")
    .filter(Boolean);
  if (tokens.length === 0) return txs;
  return txs.filter((tx) => {
    const haystack = `${normText(String(tx.merchant ?? ""))} ${normText(String(tx.counterparty ?? ""))}`;
    return tokens.every((tok) => haystack.includes(tok));
  });
}
