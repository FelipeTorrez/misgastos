import { z } from "zod";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(s: string): boolean {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export const MonthQuery = z
  .string()
  .regex(MONTH_RE, "month debe ser YYYY-MM válido");

export const DateQuery = z
  .string()
  .regex(DATE_RE, "date debe ser YYYY-MM-DD")
  .refine(isCalendarDate, { message: "date no es una fecha calendario válida" });

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

export const DateTimeQuery = z.union([
  DateQuery,
  z
    .string()
    .regex(DATETIME_RE, "date debe ser YYYY-MM-DD o ISO datetime")
    .refine((s) => isCalendarDate(s.slice(0, 10)), {
      message: "date no es una fecha calendario válida",
    }),
]);

function rangeOk(v: { from?: string; to?: string }): boolean {
  if (v.from && v.to) return v.to >= v.from;
  return true;
}

// path mutable: ZodCustomIssue exige (string|number)[], un tuple `as const` no compila
const rangeRefine = { message: "to debe ser >= from", path: ["to"] };

export const BalanceQuery = z
  .object({
    month: MonthQuery.optional(),
    from: DateQuery.optional(),
    to: DateQuery.optional(),
  })
  .refine(rangeOk, rangeRefine);

export const TransactionsQuery = z
  .object({
    month: MonthQuery.optional(),
    from: DateQuery.optional(),
    to: DateQuery.optional(),
    category_id: z.string().optional(),
    account_id: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  })
  .refine(rangeOk, rangeRefine);

const BudgetMonthQuery = z.union([
  MonthQuery,
  z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/, "month debe ser YYYY-MM o YYYY-MM-01 válido"),
]);

export const BudgetsQuery = z
  .object({
    month: BudgetMonthQuery.optional(),
    from: DateQuery.optional(),
    to: DateQuery.optional(),
  })
  .refine(rangeOk, rangeRefine);
