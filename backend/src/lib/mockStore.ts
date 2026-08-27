/**
 * In-memory store for mock mode (no Supabase) con persistencia a disco.
 * Escribe en .mockstore.json (cwd del backend) tras cada mutación,
 * así los datos de demo sobreviven reinicios de tsx --watch o del PC.
 */
import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), ".mockstore.json");

type DiskData = {
  rules: any[];
  transactions: any[];
  budgets: any[];
  rawEvents: Record<string, string>;
};

function loadFromDisk(): DiskData | null {
  if (process.env.NODE_ENV === "test") return null;
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const d = JSON.parse(raw);
    if (Array.isArray(d.rules) && Array.isArray(d.transactions)) {
      return {
        rules: d.rules,
        transactions: d.transactions,
        budgets: Array.isArray(d.budgets) ? d.budgets : [],
        rawEvents: (d.rawEvents && typeof d.rawEvents === "object") ? d.rawEvents : {},
      };
    }
  } catch { /* archivo no existe aún */ }
  return null;
}

function uuid() {
  return crypto.randomUUID();
}

const initial = loadFromDisk();

export const mockStore = {
  rules: initial?.rules ?? ([] as any[]),
  transactions: initial?.transactions ?? ([] as any[]),
  budgets: initial?.budgets ?? ([] as any[]),
  rawEvents: initial?.rawEvents ?? ({} as Record<string, string>),

  _persist() {
    if (process.env.NODE_ENV === "test") return;
    try {
      fs.writeFileSync(FILE, JSON.stringify({ rules: this.rules, transactions: this.transactions, budgets: this.budgets, rawEvents: this.rawEvents }));
    } catch { /* best-effort */ }
  },

  // Budgets
  listBudgets(userId: string, month: string) {
    return this.budgets.filter(b => b.user_id === userId && b.month === month);
  },
  upsertBudget(userId: string, data: { category_id: string | null; amount: number; month: string; period?: string }) {
    const idx = this.budgets.findIndex(b => b.user_id === userId && b.month === data.month && b.category_id === data.category_id);
    if (idx >= 0) {
      this.budgets[idx] = { ...this.budgets[idx], ...data, updated_at: new Date().toISOString() };
      this._persist();
      return this.budgets[idx];
    }
    const b = { id: `budget-${uuid()}`, user_id: userId, created_at: new Date().toISOString(), ...data };
    this.budgets.push(b);
    this._persist();
    return b;
  },
  deleteBudget(userId: string, budgetId: string) {
    const idx = this.budgets.findIndex(b => b.id === budgetId && b.user_id === userId);
    if (idx >= 0) this.budgets.splice(idx, 1);
    this._persist();
    return idx >= 0;
  },

  // Rules
  listRules(userId: string) {
    return this.rules.filter(r => r.user_id === userId);
  },
  findRule(userId: string, merchantNormalized: string) {
    return this.rules.find(r => r.user_id === userId && r.merchant_normalized === merchantNormalized) ?? null;
  },
  upsertRule(userId: string, data: { merchant_normalized: string; preferred_category_id: string; preferred_merchant_alias?: string }) {
    const idx = this.rules.findIndex(r => r.user_id === userId && r.merchant_normalized === data.merchant_normalized);
    if (idx >= 0) {
      this.rules[idx] = { ...this.rules[idx], ...data, updated_at: new Date().toISOString() };
      this._persist();
      return this.rules[idx];
    }
    const rule = { id: `rule-${uuid()}`, user_id: userId, hits_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...data };
    this.rules.push(rule);
    this._persist();
    return rule;
  },
  updateRule(userId: string, ruleId: string, data: any) {
    const idx = this.rules.findIndex(r => r.id === ruleId && r.user_id === userId);
    if (idx < 0) return null;
    this.rules[idx] = { ...this.rules[idx], ...data, updated_at: new Date().toISOString() };
    this._persist();
    return this.rules[idx];
  },
  deleteRule(userId: string, ruleId: string) {
    const idx = this.rules.findIndex(r => r.id === ruleId && r.user_id === userId);
    if (idx >= 0) this.rules.splice(idx, 1);
    this._persist();
    return idx >= 0;
  },
  incrementRuleHits(ruleId: string) {
    const r = this.rules.find(r => r.id === ruleId);
    if (r) r.hits_count = (r.hits_count ?? 0) + 1;
    this._persist();
  },

  // Transactions
  listTransactions(userId: string, filters?: { month?: string; category_id?: string; account_id?: string }) {
    let list = this.transactions.filter(t => t.user_id === userId);
    if (filters?.month) list = list.filter(t => t.date?.startsWith(filters.month!));
    if (filters?.category_id) list = list.filter(t => t.category_id === filters.category_id);
    if (filters?.account_id) list = list.filter(t => t.account_id === filters.account_id);
    return list.sort((a: any, b: any) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 100);
  },
  insertTransaction(userId: string, data: any) {
    const tx = { id: `mock-tx-${uuid()}`, user_id: userId, created_at: new Date().toISOString(), ...data };
    this.transactions.push(tx);
    this._persist();
    return tx;
  },
  updateTransaction(userId: string, txId: string, data: any) {
    const idx = this.transactions.findIndex(t => t.id === txId && t.user_id === userId);
    if (idx < 0) return null;
    this.transactions[idx] = { ...this.transactions[idx], ...data, updated_at: new Date().toISOString() };
    this._persist();
    return this.transactions[idx];
  },
  deleteTransaction(userId: string, txId: string) {
    const idx = this.transactions.findIndex(t => t.id === txId && t.user_id === userId);
    if (idx >= 0) this.transactions.splice(idx, 1);
    this._persist();
    return idx >= 0;
  },

  // Reset (for tests)
  reset() {
    this.rules.length = 0;
    this.transactions.length = 0;
    this.budgets.length = 0;
    this._persist();
  }
};
