import { useState, useEffect, useCallback, useMemo } from "react";
import { API_URL } from "./supabase";
import { fetchCategories, Category } from "./categories";

export type Balance = { income: number; expense: number; balance: number; weekly: any[]; range?: any };
export type Budget = {
  id: string;
  category_id: string | null;
  amount: number;
  month: string;
  spent: number;
  remaining: number;
  pct: number;
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
  txs: any[];
  budgets: Budget[];
  cats: Category[];
  byCat: Record<string, number>;
  byCategory: any[];
  loading: boolean;
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

/**
 * Fuente única de datos del shell persistente.
 * Carga balance + transacciones + presupuestos en paralelo,
 * de modo que cambiar el mes (o el rango) recalcula todas las sub-tabs a la vez.
 */
export function useShellData(period: Period): ShellData {
  const [balance, setBalance] = useState<Balance>({ income: 0, expense: 0, balance: 0, weekly: [], range: undefined });
  const [txs, setTxs] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [byCategory, setByCategory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const [b, t, bd] = await Promise.all([
        fetch(`${API_URL}/v1/balance?${balanceQuery(p)}`).then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`${API_URL}/v1/transactions?${txsQuery(p)}`).then(r => (r.ok ? r.json() : [])).catch(() => []),
        fetch(`${API_URL}/v1/budgets?${budgetsQuery(p)}`).then(r => (r.ok ? r.json() : [])).catch(() => []),
      ]);
      if (b) {
        setBalance({ income: b.income ?? 0, expense: b.expense ?? 0, balance: b.balance ?? 0, weekly: b.weekly ?? [], range: b.range });
        if (Array.isArray(b.by_category)) setByCategory(b.by_category);
        else setByCategory([]);
      }
      if (Array.isArray(t)) setTxs(t);
      if (Array.isArray(bd)) setBudgets(bd);
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

  return { balance, txs, budgets, cats, byCat, byCategory, loading, reload: () => load(period) };
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
