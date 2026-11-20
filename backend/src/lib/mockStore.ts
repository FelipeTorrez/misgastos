/**
 * In-memory store for mock mode (no Supabase) con persistencia a disco.
 * Escribe en .mockstore.json (cwd del backend) tras cada mutación,
 * así los datos de demo sobreviven reinicios de tsx --watch o del PC.
 */
import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), ".mockstore.json");

export type MockRawEvent = {
  id: string;
  user_id: string;
  source: string;
  external_id: string | null;
  sender: string | null;
  subject: string | null;
  raw_content: string;
  received_at: string;
  metadata?: any;
  mocked?: boolean;
};

type DiskData = {
  rules: any[];
  transactions: any[];
  budgets: any[];
  rawEvents: MockRawEvent[] | Record<string, string>;
  settings: Record<string, any>;
};

/** Compat: el shape viejo era un mapa source:external_id → id (solo idempotencia). */
function toRawEventList(raw: unknown): MockRawEvent[] {
  if (Array.isArray(raw)) return raw as MockRawEvent[];
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, string>).map(([key, id]) => {
      const sep = key.indexOf(":");
      return {
        id: String(id),
        user_id: "",
        source: sep >= 0 ? key.slice(0, sep) : key,
        external_id: sep >= 0 ? key.slice(sep + 1) : null,
        sender: null,
        subject: null,
        raw_content: "",
        received_at: new Date().toISOString(),
      } as MockRawEvent;
    });
  }
  return [];
}

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
        rawEvents: toRawEventList(d.rawEvents),
        settings: (d.settings && typeof d.settings === "object") ? d.settings : {},
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
  rawEvents: ((initial?.rawEvents ?? []) as MockRawEvent[]),
  settings: initial?.settings ?? ({} as Record<string, any>),

  _persist() {
    if (process.env.NODE_ENV === "test") return;
    try {
      fs.writeFileSync(FILE, JSON.stringify({ rules: this.rules, transactions: this.transactions, budgets: this.budgets, rawEvents: this.rawEvents, settings: this.settings }));
    } catch { /* best-effort */ }
  },

  // User settings (billing cycle)
  getSettings(userId: string) {
    const s = this.settings[userId];
    return s ? { user_id: userId, ...s } : null;
  },
  upsertSettings(userId: string, data: { billing_cycle_day?: number; billing_cycle_enabled?: boolean | null }) {
    const cur = this.settings[userId] ?? {};
    const next = {
      ...cur,
      ...data,
      billing_cycle_day: data.billing_cycle_day ?? cur.billing_cycle_day ?? 20,
      billing_cycle_enabled: data.billing_cycle_enabled !== undefined ? data.billing_cycle_enabled : (cur.billing_cycle_enabled ?? null),
      updated_at: new Date().toISOString(),
      created_at: cur.created_at ?? new Date().toISOString(),
    };
    this.settings[userId] = next;
    this._persist();
    return { user_id: userId, ...next };
  },

  // Budgets
  listBudgets(userId: string, month: string) {
    return this.budgets.filter(b => b.user_id === userId && b.month === month);
  },
  upsertBudget(userId: string, data: { category_id: string | null; amount: number; month: string; period?: string }) {
    const period = data.period ?? "monthly";
    const idx = this.budgets.findIndex(b => b.user_id === userId && b.month === data.month && b.category_id === data.category_id && (b.period ?? "monthly") === period);
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

  // Raw events (auditoría: correo/notificación original del gasto)
  insertRawEvent(userId: string, data: { source: string; external_id?: string | null; sender?: string | null; subject?: string | null; raw_content: string; received_at?: string; metadata?: any; mocked?: boolean }) {
    const row: MockRawEvent = {
      id: `mock-${uuid()}`,
      user_id: userId,
      source: data.source,
      external_id: data.external_id ?? null,
      sender: data.sender ?? null,
      subject: data.subject ?? null,
      raw_content: data.raw_content,
      received_at: data.received_at ?? new Date().toISOString(),
      metadata: data.metadata,
      mocked: data.mocked,
    };
    this.rawEvents.push(row);
    this._persist();
    return row;
  },
  getRawEvent(id: string, userId?: string) {
    return this.rawEvents.find(r => r.id === id && (!userId || !r.user_id || r.user_id === userId)) ?? null;
  },
  findRawEventByExternal(userId: string, source: string, external_id: string | null) {
    if (!external_id) return null;
    return this.rawEvents.find(r => r.source === source && r.external_id === external_id && (!r.user_id || r.user_id === userId)) ?? null;
  },
  updateRawEvent(id: string, patch: Partial<MockRawEvent>) {
    const row = this.rawEvents.find(r => r.id === id);
    if (!row) return null;
    Object.assign(row, patch);
    this._persist();
    return row;
  },
  /**
   * Auditoría raw_events (orden recibido desc). pending=true excluye los que
   * ya tienen transacción vinculada y los descartados por el guard de IA.
   */
  listRawEvents(userId: string, opts?: { limit?: number; offset?: number; pending?: boolean }) {
    const limit = Math.max(1, Math.min(500, opts?.limit ?? 50));
    const offset = Math.max(0, opts?.offset ?? 0);
    let rows = this.rawEvents.filter(r => !r.user_id || r.user_id === userId);
    if (opts?.pending) {
      const linked = new Set(
        this.transactions.filter(t => t.user_id === userId).map(t => t.raw_event_id).filter(Boolean),
      );
      rows = rows.filter(r => r.metadata?.guard?.is_transaction !== false && !linked.has(r.id));
    }
    rows = rows.sort((a, b) => String(b.received_at ?? "").localeCompare(String(a.received_at ?? "")));
    return rows.slice(offset, offset + limit);
  },

  // Transactions
  getTransaction(userId: string, txId: string) {
    return this.transactions.find(t => t.id === txId && t.user_id === userId) ?? null;
  },
  listTransactions(userId: string, filters?: { month?: string; from?: string; to?: string; category_id?: string; account_id?: string; limit?: number }) {
    let list = this.transactions.filter(t => t.user_id === userId);
    if (filters?.month) {
      list = list.filter(t => typeof t.date === "string" && t.date.startsWith(filters.month!));
    } else if (filters?.from || filters?.to) {
      list = list.filter(t => {
        if (typeof t.date !== "string") return false;
        const d = t.date.slice(0, 10);
        if (filters?.from && d < filters.from) return false;
        if (filters?.to && d > filters.to) return false;
        return true;
      });
    }
    if (filters?.category_id) list = list.filter(t => t.category_id === filters.category_id);
    if (filters?.account_id) list = list.filter(t => t.account_id === filters.account_id);
    return list.sort((a: any, b: any) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, filters?.limit ?? 100);
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
    this.rawEvents.length = 0;
    this._persist();
  }
};
