import { useState, useEffect, useCallback, useMemo } from "react";
import { API_URL } from "./supabase";
import { fetchCategories, Category } from "./categories";

export type Balance = { income: number; expense: number; balance: number; weekly: any[] };
export type Budget = {
  id: string;
  category_id: string | null;
  amount: number;
  month: string;
  spent: number;
  remaining: number;
  pct: number;
  categories?: { name: string; slug: string } | null;
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

/**
 * Fuente única de datos del shell persistente.
 * Carga balance + transacciones + presupuestos del mes en paralelo,
 * de modo que cambiar el mes recalcula todas las sub-tabs a la vez.
 */
export function useShellData(month: string): ShellData {
  const [balance, setBalance] = useState<Balance>({ income: 0, expense: 0, balance: 0, weekly: [] });
  const [txs, setTxs] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [byCategory, setByCategory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    try {
      const [b, t, bd] = await Promise.all([
        fetch(`${API_URL}/v1/balance?month=${m}`).then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`${API_URL}/v1/transactions?month=${m}`).then(r => (r.ok ? r.json() : [])).catch(() => []),
        fetch(`${API_URL}/v1/budgets?month=${m}-01`).then(r => (r.ok ? r.json() : [])).catch(() => []),
      ]);
      if (b) {
        setBalance({ income: b.income ?? 0, expense: b.expense ?? 0, balance: b.balance ?? 0, weekly: b.weekly ?? [] });
        if (Array.isArray(b.by_category)) setByCategory(b.by_category);
        else setByCategory([]);
      }
      if (Array.isArray(t)) setTxs(t);
      if (Array.isArray(bd)) setBudgets(bd);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchCategories().then(setCats); }, []);
  useEffect(() => { load(month); }, [month, load]);

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

  return { balance, txs, budgets, cats, byCat, byCategory, loading, reload: () => load(month) };
}
