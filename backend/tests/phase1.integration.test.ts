import { describe, it, expect, beforeEach, vi } from "vitest";

// --- mock supabase antes de importar rutas ---
const CAT_SUPER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CAT_TRANS = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const store: Record<string, any[]> = { accounts: [], transactions: [], budgets: [], categories: [
  { id: CAT_SUPER, slug: "supermercado", name: "Supermercado" },
  { id: CAT_TRANS, slug: "transporte", name: "Transporte" }
], rules: [] };

function reset() { for (const k of Object.keys(store)) if (k!=="categories") store[k]=[]; }

function query(table: string) {
  let filters: any[] = [];
  let inserts: any = null;
  let updates: any = null;
  let isDelete = false;
  const api: any = {
    select: () => api,
    eq: (c:string, v:any)=>{filters.push((r:any)=>r[c]===v); return api;},
    is: (c:string, v:any)=>{filters.push((r:any)=>r[c]===v); return api;},
    gte: ()=>api, lt: ()=>api, or: ()=>api, order: ()=>api, limit: ()=>api,
    insert: (row:any)=>{inserts=row; return api;},
    update: (patch:any)=>{updates=patch; return api;},
    delete: ()=>{isDelete=true; return api;},
    upsert: (row:any)=>{ // para budgets
      const idx = store[table].findIndex(r=>r.user_id===row.user_id && r.month===row.month && r.category_id===row.category_id);
      if (idx>=0) { Object.assign(store[table][idx], row); return { select: ()=>({ single: async()=>({data: store[table][idx], error:null}) }) }; }
      inserts=row; return api;
    },
    single: async ()=>{
      if (inserts) {
        // check global dup
        if (table==="budgets" && inserts.category_id===null) {
          const dup = store[table].find(r=>r.user_id===inserts.user_id && r.month===inserts.month && r.category_id===null);
          if (dup) return { data:null, error:{message:"duplicate"} };
        }
        const row={ id: crypto.randomUUID(), ...inserts, created_at: new Date().toISOString(), updated_at: new Date().toISOString()};
        store[table].push(row); inserts=null; return {data:row, error:null};
      }
      if (updates) {
        const f = store[table].find(r=>filters.every(fn=>fn(r)));
        if (!f) return {data:null, error:{message:"not found"}};
        Object.assign(f, updates); updates=null; return {data:f, error:null};
      }
      if (isDelete) {
        const before=store[table].length;
        store[table]=store[table].filter(r=>!filters.every(fn=>fn(r)));
        isDelete=false; return {data:null, error: store[table].length===before? {message:"not found"}: null, then:(cb:any)=>cb({error:null})};
      }
      const found=store[table].find(r=>filters.every(fn=>fn(r)));
      return {data: found ?? null, error: null};
    },
    // thenable para list queries
    then: (resolve:any)=>{
      if (inserts) return resolve({data:null, error:null});
      if (isDelete) {
        // delete list
        store[table]=store[table].filter(r=>!filters.every(fn=>fn(r)));
        isDelete=false; return resolve({data:null, error:null});
      }
      let rows=[...store[table]];
      for (const f of filters) rows=rows.filter(f);
      resolve({data: rows, error:null});
    }
  };
  return api;
}

vi.mock("../src/lib/supabase.js", () => ({
  supabase: { from: (t:string)=>query(t) },
  getUserId: (req:any)=> req.headers["x-user-id"] ?? "user-aaa"
}));

import app from "../src/index.js";

beforeEach(()=> reset());

describe("#2 Integration — Phase 1 Core Finance", () => {
  it("GET /health", async () => {
    const res = await app.inject({ method:"GET", url:"/health" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
    expect(body.phase).toBeDefined();
  });

  it("POST /v1/accounts — crea vista y cash, rechaza investment", async () => {
    const ok = await app.inject({ method:"POST", url:"/v1/accounts", headers:{ "x-user-id":"user-aaa" }, payload:{ name:"Cuenta RUT", type:"vista" }});
    expect(ok.statusCode).toBe(201);
    const bad = await app.inject({ method:"POST", url:"/v1/accounts", headers:{ "x-user-id":"user-aaa" }, payload:{ name:"Fintual", type:"investment"} as any});
    expect(bad.statusCode).toBe(400);
  });

  it("RLS: user-aaa no ve cuentas de user-bbb", async () => {
    await app.inject({ method:"POST", url:"/v1/accounts", headers:{ "x-user-id":"user-bbb" }, payload:{ name:"BB", type:"cash"}});
    const res = await app.inject({ method:"GET", url:"/v1/accounts", headers:{ "x-user-id":"user-aaa"}});
    const data = JSON.parse(res.body);
    expect(data.every((a:any)=>a.user_id==="user-aaa")).toBe(true);
  });

  it("POST /v1/transactions — expense + income + transfer 1-fila", async () => {
    // cuentas
    const a1 = JSON.parse((await app.inject({ method:"POST", url:"/v1/accounts", headers:{ "x-user-id":"user-aaa"}, payload:{name:"C1", type:"checking"}})).body);
    const a2 = JSON.parse((await app.inject({ method:"POST", url:"/v1/accounts", headers:{ "x-user-id":"user-aaa"}, payload:{name:"C2", type:"vista"}})).body);
    const e = await app.inject({ method:"POST", url:"/v1/transactions", headers:{ "x-user-id":"user-aaa"}, payload:{ merchant:"Lider", amount:32990, type:"expense", date:"2026-08-24"}});
    expect(e.statusCode).toBe(201);
    const inc = await app.inject({ method:"POST", url:"/v1/transactions", headers:{ "x-user-id":"user-aaa"}, payload:{ merchant:"Sueldo", amount:2500000, type:"income", date:"2026-08-01"}});
    expect(inc.statusCode).toBe(201);
    const trOk = await app.inject({ method:"POST", url:"/v1/transactions", headers:{ "x-user-id":"user-aaa"}, payload:{ merchant:"Traspaso", amount:100000, type:"transfer", date:"2026-08-24", from_account_id: a1.id, to_account_id: a2.id }});
    expect(trOk.statusCode).toBe(201);
    const trBad = await app.inject({ method:"POST", url:"/v1/transactions", headers:{ "x-user-id":"user-aaa"}, payload:{ merchant:"Bad", amount:1000, type:"transfer", date:"2026-08-24", from_account_id: a1.id, to_account_id: a1.id }});
    expect(trBad.statusCode).toBe(400);
  });

  it("GET /v1/balance — transfer no afecta global", async () => {
    const a1 = JSON.parse((await app.inject({ method:"POST", url:"/v1/accounts", headers:{ "x-user-id":"user-aaa"}, payload:{name:"C1", type:"checking"}})).body);
    const a2 = JSON.parse((await app.inject({ method:"POST", url:"/v1/accounts", headers:{ "x-user-id":"user-aaa"}, payload:{name:"C2", type:"vista"}})).body);
    await app.inject({ method:"POST", url:"/v1/transactions", headers:{ "x-user-id":"user-aaa"}, payload:{ merchant:"Inc", amount:100000, type:"income", date:"2026-08-10"}});
    await app.inject({ method:"POST", url:"/v1/transactions", headers:{ "x-user-id":"user-aaa"}, payload:{ merchant:"Exp", amount:20000, type:"expense", date:"2026-08-10"}});
    await app.inject({ method:"POST", url:"/v1/transactions", headers:{ "x-user-id":"user-aaa"}, payload:{ merchant:"Tr", amount:50000, type:"transfer", date:"2026-08-10", from_account_id:a1.id, to_account_id:a2.id}});
    const res = await app.inject({ method:"GET", url:"/v1/balance?month=2026-08", headers:{ "x-user-id":"user-aaa"}});
    const j = JSON.parse(res.body);
    expect(j.income).toBe(100000); expect(j.expense).toBe(20000); expect(j.balance).toBe(80000);
  });

  it("POST /v1/budgets — global + categoría y cálculo spent", async () => {
    const month="2026-08-01";
    await app.inject({ method:"POST", url:"/v1/budgets", headers:{ "x-user-id":"user-aaa"}, payload:{ category_id:null, amount:800000, month}});
    await app.inject({ method:"POST", url:"/v1/budgets", headers:{ "x-user-id":"user-aaa"}, payload:{ category_id:CAT_SUPER, amount:250000, month}});
    await app.inject({ method:"POST", url:"/v1/transactions", headers:{ "x-user-id":"user-aaa"}, payload:{ merchant:"Lider", amount:50000, type:"expense", date:"2026-08-05", category_id:CAT_SUPER}});
    await app.inject({ method:"POST", url:"/v1/transactions", headers:{ "x-user-id":"user-aaa"}, payload:{ merchant:"Uber", amount:15000, type:"expense", date:"2026-08-06", category_id:CAT_TRANS}});
    const res = await app.inject({ method:"GET", url:`/v1/budgets?month=${month}`, headers:{ "x-user-id":"user-aaa"}});
    const budgets = JSON.parse(res.body);
    const g = budgets.find((b:any)=>b.category_id===null);
    const s = budgets.find((b:any)=>b.category_id===CAT_SUPER);
    expect(g.spent).toBe(65000); expect(g.remaining).toBe(735000);
    expect(s.spent).toBe(50000); expect(s.pct).toBe(20);
  });

  it("PATCH /v1/transactions/:id — corrige categoría y crea rule (todo a revisión)", async () => {
    const created = JSON.parse((await app.inject({ method:"POST", url:"/v1/transactions", headers:{ "x-user-id":"user-aaa"}, payload:{ merchant:"Spotify", amount:7490, type:"expense", date:"2026-08-10", category_id:CAT_TRANS}})).body);
    const patched = await app.inject({ method:"PATCH", url:`/v1/transactions/${created.id}`, headers:{ "x-user-id":"user-aaa"}, payload:{ category_id:CAT_SUPER}});
    expect(patched.statusCode).toBe(200);
    expect(JSON.parse(patched.body).status).toBe("corrected");
  });
});
