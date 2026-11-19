import { useState, useEffect, useCallback, useMemo } from "react";
import { API_URL } from "./supabase";
import { fetchCategories, Category } from "./categories";
import { prevRange } from "./billingCycle";
import { shiftMonth } from "../theme/tokens";
import {
  ShellStatus,
  combineShellStatuses,
  shellErrorMessage,
  statusFromHttp,
  statusFromRejection,
} from "./shellStatus";

export type Balance = { income: number; expense: number; balance: number; weekly: any[]; range?: any };
export type Budget = {
  id: string;
  category_id: string | null;
  amount: number;
  month: string;
  spent: number;
  remaining: number;
  pct: number;
  period?: string;
  partial?: boolean;
  coveredDays?: number;
  totalDays?: number;
  categories?: { name: string; slug: string } | null;
  range?: { from: string; to: string } | null;
  effective?: boolean;
};

export type Period =
  | { type: "month"; month: string }
  | { type: "range"; from: string; to: string };

export type UserSettings = {
  billing_cycle_day: number;
  billing_cycle_enabled: boolean | null;
};

export type ShellData = {
  balance: Balance;
  prevExpense: number | null;
  txs: any[];
  txsTruncated: boolean;
  txsLimit: number;
  budgets: Budget[];
  cats: Category[];
  byCat: Record<string, number>;
  byCategory: any[];
  loading: boolean;
  error: boolean;
  errorMessage: string | null;
  reload: () => void;
};

function balanceQuery(p: Period): string {
  if (p.type === "month") return `month=${p.month}`;
  return `from=${p.from}&to=${p.to}`;
}
function txsQuery(p: Period): string {
  if (p.type === "month") return `month=${p.month}`;
  return `from=${p.from}&to=${p.to}&limit=500`;
}
function budgetsQuery(p: Period): string {
  if (p.type === "month") return `month=${p.month}-01`;
  return `from=${p.from}&to=${p.to}`;
}
function prevBalanceQuery(p: Period): string {
  if (p.type === "range") {
    const prev = prevRange(p.from, p.to);
    return `from=${prev.from}&to=${prev.to}`;
  }
  return `month=${shiftMonth(p.month, -1)}`;
}

/**
 * Fuente única de datos del shell persistente.
 * Carga balance + transacciones + presupuestos en paralelo,
 * de modo que cambiar el mes (o el rango) recalcula todas las sub-tabs a la vez.
 */
export function useShellData(period: Period): ShellData {
  const [balance, setBalance] = useState<Balance>({ income: 0, expense: 0, balance: 0, weekly: [], range: undefined });
  const [prevExpense, setPrevExpense] = useState<number | null>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [txsTruncated, setTxsTruncated] = useState(false);
  const [txsLimit, setTxsLimit] = useState(100);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [byCategory, setByCategory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const [b, t, bd, pb] = await Promise.all([
        (async (): Promise<{ status: ShellStatus; data: any }> => {
          try {
            const r = await fetch(`${API_URL}/v1/balance?${balanceQuery(p)}`);
            if (!r.ok) return { status: statusFromHttp(r.status, await r.json().catch(() => undefined)), data: null };
            return { status: { ok: true }, data: await r.json().catch(() => null) };
          } catch (e) { return { status: statusFromRejection(e), data: null }; }
        })(),
        (async (): Promise<{ status: ShellStatus; data: { rows: any; truncated: boolean; limit: number } | null }> => {
          try {
            const r = await fetch(`${API_URL}/v1/transactions?${txsQuery(p)}`);
            if (!r.ok) return { status: statusFromHttp(r.status, await r.json().catch(() => undefined)), data: null };
            const rows = await r.json().catch(() => null);
            if (!Array.isArray(rows)) return { status: { ok: true }, data: null };
            const limitHeader = r.headers?.get?.("x-transactions-limit");
            const limit = limitHeader ? parseInt(limitHeader, 10) || 100 : 100;
            return { status: { ok: true }, data: { rows, truncated: r.headers?.get?.("x-transactions-truncated") === "1", limit } };
          } catch (e) { return { status: statusFromRejection(e), data: null }; }
        })(),
        (async (): Promise<{ status: ShellStatus; data: any }> => {
          try {
            const r = await fetch(`${API_URL}/v1/budgets?${budgetsQuery(p)}`);
            if (!r.ok) return { status: statusFromHttp(r.status, await r.json().catch(() => undefined)), data: null };
            return { status: { ok: true }, data: await r.json().catch(() => null) };
          } catch (e) { return { status: statusFromRejection(e), data: null }; }
        })(),
        (async (): Promise<{ status: ShellStatus; data: any }> => {
          try {
            const r = await fetch(`${API_URL}/v1/balance?${prevBalanceQuery(p)}`);
            if (!r.ok) return { status: statusFromHttp(r.status, await r.json().catch(() => undefined)), data: null };
            return { status: { ok: true }, data: await r.json().catch(() => null) };
          } catch (e) { return { status: statusFromRejection(e), data: null }; }
        })(),
      ]);
      const combined = combineShellStatuses([b.status, t.status, bd.status, pb.status]);
      if (!combined.ok) {
        // Error real (red caída o 5xx como db_unavailable): NO pisar datos previos con ceros.
        setError(true);
        setErrorMessage(shellErrorMessage(combined));
      } else {
        setError(false);
        setErrorMessage(null);
      }
      if (b.status.ok && b.data) {
        setBalance({ income: b.data.income ?? 0, expense: b.data.expense ?? 0, balance: b.data.balance ?? 0, weekly: b.data.weekly ?? [], range: b.data.range });
        if (Array.isArray(b.data.by_category)) setByCategory(b.data.by_category);
        else setByCategory([]);
      }
      if (t.status.ok && t.data && Array.isArray(t.data.rows)) setTxs(t.data.rows);
      if (t.status.ok && t.data) {
        setTxsTruncated(!!t.data.truncated);
        setTxsLimit(typeof t.data.limit === "number" ? t.data.limit : 100);
      }
      if (bd.status.ok && Array.isArray(bd.data)) setBudgets(bd.data);
      if (pb.status.ok && pb.data && typeof pb.data.expense === "number") setPrevExpense(pb.data.expense);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchCategories().then(setCats); }, []);
  useEffect(() => { load(period); }, [period, load]);

  const byCat = useMemo(() => {
    if (byCategory.length) {
      const m: Record<string, number> = {};
      for (const e of byCategory) m[e.category_id] = e.spent;
      return m;
    }
    const m: Record<string, number> = {};
    for (const t of txs) {
      if (t.type === "expense" && t.status !== "duplicate" && t.status !== "ignored" && t.category_id) {
        m[t.category_id] = (m[t.category_id] ?? 0) + t.amount;
      }
    }
    return m;
  }, [txs, byCategory]);

  return { balance, prevExpense, txs, txsTruncated, txsLimit, budgets, cats, byCat, byCategory, loading, error, errorMessage, reload: () => load(period) };
}

export async function fetchSettings(): Promise<UserSettings | null> {
  try {
    const r = await fetch(`${API_URL}/v1/settings`);
    if (!r.ok) return null;
    const s = await r.json();
    if (!s) return null;
    return { billing_cycle_day: s.billing_cycle_day ?? 20, billing_cycle_enabled: s.billing_cycle_enabled ?? null };
  } catch {
    return null;
  }
}

export async function saveSettings(pay: Partial<UserSettings>): Promise<UserSettings | null> {
  try {
    const r = await fetch(`${API_URL}/v1/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pay),
    });
    if (!r.ok) return null;
    const s = await r.json();
    return s ? { billing_cycle_day: s.billing_cycle_day ?? 20, billing_cycle_enabled: s.billing_cycle_enabled ?? null } : null;
  } catch {
    return null;
  }
}
