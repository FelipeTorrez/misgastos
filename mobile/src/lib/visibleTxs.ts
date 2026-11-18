export type TxLike = {
  status?: unknown;
  [key: string]: unknown;
};

export function isDescartado(tx: TxLike | null | undefined): boolean {
  return tx?.status === "duplicate" || tx?.status === "ignored";
}

export function splitDescartados<T extends TxLike>(txs: T[] | null | undefined): {
  visibles: T[];
  descartados: T[];
} {
  const list = txs ?? [];
  const visibles: T[] = [];
  const descartados: T[] = [];
  for (const tx of list) {
    if (isDescartado(tx)) descartados.push(tx);
    else visibles.push(tx);
  }
  return { visibles, descartados };
}
