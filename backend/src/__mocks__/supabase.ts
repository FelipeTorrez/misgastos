// @ts-nocheck
// Mock ligero de Supabase para tests #2 integración sin DB real
type Row = Record<string, any>;
const store: Record<string, Row[]> = { accounts: [], transactions: [], budgets: [], categories: [], rules: [] };

function resetStore() {
  for (const k of Object.keys(store)) store[k] = [];
}

function makeQuery(table: string) {
  let filters: ((r: Row) => boolean)[] = [];
  let pendingInsert: Row | null = null;
  let pendingUpdate: Row | null = null;
  const api: any = {
    select: () => api,
    eq: (col: string, val: any) => { filters.push(r => r[col] === val); return api; },
    is: (col: string, val: any) => { filters.push(r => r[col] === val); return api; },
    gte: () => api, lt: () => api, or: () => api, order: () => api, limit: () => api,
    insert: (row: Row) => { pendingInsert = row; return api; },
    update: (patch: Row) => { pendingUpdate = patch; return api; },
    delete: () => api,
    upsert: (row: Row) => { pendingInsert = row; return api; },
    single: async () => {
      if (pendingInsert) {
        const row = { id: crypto.randomUUID(), ...pendingInsert, created_at: new Date().toISOString() };
        // simulación índice presupuesto global
        if (table === "budgets" && row.category_id === null) {
          const dup = store[table].find(r => r.user_id === row.user_id && r.month === row.month && r.category_id === null);
          if (dup) return { data: null, error: { message: "duplicate global budget" } };
        }
        store[table].push(row);
        pendingInsert = null;
        return { data: row, error: null };
      }
      if (pendingUpdate) {
        const found = store[table].find(r => filters.every(f=>f(r)));
        if (!found) return { data: null, error: { message: "not found" } };
        Object.assign(found, pendingUpdate);
        pendingUpdate = null;
        return { data: found, error: null };
      }
      // select single
      const found = store[table].find(r => filters.every(f=>f(r)));
      return { data: found ?? null, error: null };
    },
    // para list: await q (thenable)
    then: (resolve: any) => {
      if (pendingInsert !== null) return resolve({ data: null, error: null });
      // delete
      // si se llamó delete, filtros indican qué borrar — detectamos por falta de insert/update
      // simplificación: list
      let rows = [...store[table]];
      for (const f of filters) rows = rows.filter(f);
      resolve({ data: rows, error: null });
    }
  };
  // delete real
  const origThen = api.then;
  api.then = (resolve: any, reject: any) => {
    // si es delete chain, el caller espera error/data tras delete().eq().eq()
    // lo tratamos como query list si no hay pending
    return origThen(resolve, reject);
  };
  return api;
}

export const mockSupabase: any = {
  from: (table: string) => makeQuery(table),
  _reset: resetStore,
  _store: store
};
