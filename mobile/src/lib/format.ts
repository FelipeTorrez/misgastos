export const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Variación % del gasto actual vs ciclo anterior. null si no hay base válida. */
export function deltaPct(current: number, prev: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(prev)) return null;
  if (prev <= 0) return null;
  return Math.round(((current - prev) / prev) * 100);
}

/** Fecha corta para la línea meta de Movimientos: "dd-mm" si es del año en curso, "dd-mm-yyyy" si no. */
export function shortDate(iso: string, now: string | number | Date = new Date()): string {
  const d = new Date(iso);
  const ref = new Date(now);
  if (Number.isNaN(d.getTime()) || Number.isNaN(ref.getTime())) return fmtDate(iso);
  if (d.getFullYear() === ref.getFullYear()) {
    return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" }).replace(/\//g, "-");
  }
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
}
