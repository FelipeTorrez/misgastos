/**
 * Serie diaria de gasto + geometría del sparkline del hero.
 * PURO: sin imports de react-native (testeable en node/vitest).
 */
import { wallYMD } from "./format";
import { todayYMD } from "./projection";

export type SparkPoint = { x: number; y: number };
export type SparkRange = { from: string; to: string };

export type SparkTx = {
  amount?: number;
  type?: string;
  date?: string;
  status?: string;
};

const DAY_MS = 86400000;

function ymdToMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d);
}

/**
 * Convierte valores a puntos SVG (x de 0→width, y invertido de height→0, 0 = techo).
 * - vacío → []
 * - un solo valor → punto centrado (width/2, height/2)
 * - todos iguales → línea plana a media altura (evita pegarse al techo)
 * - width/height inválidos → []
 */
export function sparklinePoints(values: number[], width: number, height: number): SparkPoint[] {
  if (!Array.isArray(values) || values.length === 0) return [];
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];

  const vals = values.map((v) => (Number.isFinite(v) ? v : 0));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const flat = max - min < 1e-9;
  const n = vals.length;
  const round = (v: number) => Math.round(v * 100) / 100;

  return vals.map((v, i) => {
    const x = n === 1 ? width / 2 : (i * width) / (n - 1);
    const y = flat ? height / 2 : height - ((v - min) / (max - min)) * height;
    return { x: round(x), y: round(y) };
  });
}

/**
 * Gasto diario de un rango (ciclo o mes) listo para `sparklinePoints`.
 * - Solo `expense` y excluye `duplicate` / `ignored` (mismo criterio que el balance).
 * - Recorta el final en `today` para no dibujar días futuros como caída a cero.
 * - Si el rango supera `maxPoints`, agrega días consecutivos en buckets
 *   (un ciclo 20→20 de 28-31 días queda en 14-16 puntos, dentro de 12-20).
 * - Rango inválido o futuro → [].
 */
export function dailyExpenseSeries(
  txs: SparkTx[],
  range: SparkRange,
  opts?: { maxPoints?: number; today?: string }
): number[] {
  const fromMs = ymdToMs(range.from);
  const toMs = ymdToMs(range.to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return [];

  const todayMs = ymdToMs(opts?.today ?? todayYMD());
  const endMs = Number.isFinite(todayMs) && todayMs < toMs ? todayMs : toMs;
  if (endMs < fromMs) return [];

  const days = Math.round((endMs - fromMs) / DAY_MS) + 1;
  const perDay = new Array<number>(days).fill(0);

  for (const t of txs ?? []) {
    if (t.type !== "expense") continue;
    if (t.status === "duplicate" || t.status === "ignored") continue;
    if (typeof t.amount !== "number" || !Number.isFinite(t.amount)) continue;
    if (typeof t.date !== "string") continue;
    const ymd = wallYMD(t.date);
    if (!ymd) continue;
    const idx = Math.round((ymdToMs(ymd) - fromMs) / DAY_MS);
    if (idx >= 0 && idx < days) perDay[idx] += t.amount;
  }

  const maxPoints = Math.max(1, Math.floor(opts?.maxPoints ?? 20));
  const bucket = Math.max(1, Math.ceil(days / maxPoints));
  const out: number[] = [];
  for (let i = 0; i < days; i += bucket) {
    let sum = 0;
    for (let j = i; j < Math.min(i + bucket, days); j++) sum += perDay[j]!;
    out.push(sum);
  }
  return out;
}
