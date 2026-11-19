export const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Etiqueta de detalle de un presupuesto ("de $X · ...").
 * - cycle: "de $M · límite del ciclo (≈$/día)".
 * - partial con coveredDays: "de $M · C de T días (≈$/día)" dividiendo por coveredDays (NO por cycleN).
 * - mensual completo: "de $M (≈$/día)" solo si cycleN>0, sin repetir "en N días".
 */
export type BudgetLabelInput = {
  amount: number;
  period?: string;
  partial?: boolean;
  coveredDays?: number | null;
  totalDays?: number | null;
};

export function budgetDetailLabel(b: BudgetLabelInput, cycleN: number): string {
  const amount = fmtCLP(b.amount);
  if (b.period === "cycle") {
    const base = `de ${amount} · límite del ciclo`;
    if (cycleN > 0) return `${base} (≈${fmtCLP(Math.round(b.amount / cycleN))}/día)`;
    return base;
  }
  if (b.partial && b.coveredDays != null && b.coveredDays > 0) {
    const perDay = fmtCLP(Math.round(b.amount / b.coveredDays));
    if (b.totalDays != null) return `de ${amount} · ${b.coveredDays} de ${b.totalDays} días (≈${perDay}/día)`;
    return `de ${amount} (≈${perDay}/día)`;
  }
  if (cycleN > 0) return `de ${amount} (≈${fmtCLP(Math.round(b.amount / cycleN))}/día)`;
  return `de ${amount}`;
}

/** Variación % del gasto actual vs ciclo anterior. null si no hay base válida. */
export function deltaPct(current: number, prev: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(prev)) return null;
  if (prev <= 0) return null;
  return Math.round(((current - prev) / prev) * 100);
}

/** YYYY-MM-DD en semántica "hora de pared": transactions.date se guarda como hora
 * local etiquetada Z, así que el prefijo del string YA es el día del gasto.
 * Solo se convierte con Date cuando el string no trae prefijo YYYY-MM-DD.
 * Retorna null si no se puede extraer ni convertir una fecha. */
export function wallYMD(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mo}-${day}`;
}

/** Fecha de un gasto en semántica hora de pared ("dd-mm-aaaa").
 * fmtDate queda intacto para timestamps reales (received_at de raw_events). */
export function fmtWallDate(iso: string): string {
  const ymd = wallYMD(iso);
  if (!ymd) return fmtDate(iso);
  const [y, m, d] = ymd.split("-");
  return `${d}-${m}-${y}`;
}

/** Fecha corta para la línea meta de Movimientos: "dd-mm" si es del año en curso, "dd-mm-yyyy" si no.
 * Usa semántica hora de pared (wallYMD), no new Date(iso), para no correr el día por zona horaria. */
export function shortDate(iso: string, now: string | number | Date = new Date()): string {
  const ymd = wallYMD(iso);
  const ref = new Date(now);
  if (!ymd || Number.isNaN(ref.getTime())) return fmtDate(iso);
  const [y, m, d] = ymd.split("-");
  if (ref.getFullYear() === Number(y)) {
    return `${d}-${m}`;
  }
  return `${d}-${m}-${y}`;
}
