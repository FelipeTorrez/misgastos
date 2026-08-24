import { describe, it, expect, beforeEach, vi } from "vitest";
import { dataset100 } from "../../tests/fixtures/dataset100.js";

const CAT_IDS: Record<string, string> = {
  supermercado: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  transporte: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  restaurantes: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  suscripciones: "dddddddd-dddd-dddd-dddd-dddddddddddd",
  servicios: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
  salud: "ffffffff-ffff-ffff-ffff-ffffffffffff",
  vivienda: "11111111-1111-1111-8111-111111111111",
  compras: "22222222-2222-2222-8222-222222222222",
  entretenimiento: "33333333-3333-3333-8333-333333333333",
  "educación": "44444444-4444-4444-8444-444444444444",
  deudas: "55555555-5555-5555-8555-555555555555",
  otros: "66666666-6666-6666-8666-666666666666",
  "alimentación": "77777777-7777-7777-8777-777777777777",
  transferencias: "88888888-8888-8888-8888-888888888888",
};

const store: Record<string, any[]> = { accounts: [], transactions: [], budgets: [], categories: Object.entries(CAT_IDS).map(([slug,id])=>({id,slug})), rules: [] };
function reset(){ for(const k of Object.keys(store)) if(k!=="categories") store[k]=[]; }
function query(table:string){
  let filters:any[]=[]; let inserts:any=null; let updates:any=null; let isDelete=false;
  const api:any={
    select:()=>api, eq:(c:string,v:any)=>{filters.push((r:any)=>r[c]===v); return api;}, is:()=>api, gte:()=>api, lt:()=>api, or:()=>api, order:()=>api, limit:()=>api,
    insert:(row:any)=>{inserts=row; return api;}, update:(p:any)=>{updates=p; return api;}, delete:()=>{isDelete=true; return api;},
    upsert:(row:any)=>{ const idx=store[table].findIndex(r=>r.user_id===row.user_id && r.month===row.month && r.category_id===row.category_id); if(idx>=0){Object.assign(store[table][idx],row); return {select:()=>({single:async()=>({data:store[table][idx], error:null})})};} inserts=row; return api; },
    single: async()=>{ if(inserts){const row={id:crypto.randomUUID(), ...inserts, created_at:new Date().toISOString()}; store[table].push(row); inserts=null; return {data:row, error:null};} if(updates){const f=store[table].find(r=>filters.every((fn:any)=>fn(r))); if(!f) return {data:null, error:{message:"not found"}}; Object.assign(f,updates); return {data:f, error:null};} return {data:store[table].find(r=>filters.every((fn:any)=>fn(r))) ?? null, error:null}; },
    then:(resolve:any)=>{ let rows=[...store[table]]; for(const f of filters) rows=rows.filter(f); resolve({data:rows, error:null}); }
  }; return api;
}
vi.mock("../src/lib/supabase.js", ()=>({ supabase:{from:(t:string)=>query(t)}, getUserId:(req:any)=> req.headers["x-user-id"] ?? "demo" }));
import app from "../src/index.js";

const ACCOUNT_MAP: Record<string,string> = { checking:"10000000-0000-0000-0000-000000000101", vista:"10000000-0000-0000-0000-000000000102", credit_card:"10000000-0000-0000-0000-000000000103", cash:"10000000-0000-0000-0000-000000000104", digital_wallet:"10000000-0000-0000-0000-000000000105" };

beforeEach(()=> reset());

describe("Phase 2 — Integración 100 dataset (UX + reglas)", ()=>{
  it("inserta 100 y valida balance + presupuesto global con dataset real", async ()=>{
    // presupuestos
    await app.inject({ method:"POST", url:"/v1/budgets", headers:{"x-user-id":"demo"}, payload:{ category_id:null, amount:1800000, month:"2026-08-01"}});
    await app.inject({ method:"POST", url:"/v1/budgets", headers:{"x-user-id":"demo"}, payload:{ category_id:CAT_IDS.supermercado, amount:350000, month:"2026-08-01"}});
    await app.inject({ method:"POST", url:"/v1/budgets", headers:{"x-user-id":"demo"}, payload:{ category_id:CAT_IDS.transporte, amount:200000, month:"2026-08-01"}});

    for(const f of dataset100){
      const catId = CAT_IDS[f.category_slug] ?? null;
      const acc = ACCOUNT_MAP[f.account_type];
      await app.inject({ method:"POST", url:"/v1/transactions", headers:{"x-user-id":"demo"}, payload:{
        merchant:f.merchant, amount:f.amount, type:f.type, date:f.date, category_id:catId,
        account_id: f.type==="transfer"? null : acc,
        from_account_id: f.type==="transfer" ? (f.merchant.includes("Vista -> Efectivo")? ACCOUNT_MAP.vista : ACCOUNT_MAP.checking) : undefined,
        to_account_id: f.type==="transfer" ? (f.merchant.includes("Vista -> Efectivo")? ACCOUNT_MAP.cash : ACCOUNT_MAP.vista) : undefined,
        payment_method:f.payment_method
      }});
    }
    const balRes = await app.inject({ method:"GET", url:"/v1/balance?month=2026-08", headers:{"x-user-id":"demo"}});
    const bal = JSON.parse(balRes.body);
    // income 2.955.000 + 95k bono = 3.050.000, transfer excluido
    expect(bal.income).toBe(3050000);
    expect(bal.balance).toBe(bal.income - bal.expense);
    expect(bal.weekly.length).toBeGreaterThan(2); // al menos 3 semanas

    const budRes = await app.inject({ method:"GET", url:"/v1/budgets?month=2026-08-01", headers:{"x-user-id":"demo"}});
    const budgets = JSON.parse(budRes.body);
    const global = budgets.find((b:any)=>b.category_id===null);
    const superM = budgets.find((b:any)=>b.category_id===CAT_IDS.supermercado);
    expect(global.spent).toBe(bal.expense); // global = suma todos los expense
    expect(superM.pct).toBeGreaterThan(100); // overspend intencional valida UX rojo (462k/350k=132%)
    expect(superM.spent).toBeGreaterThan(350000);
    expect(budgets.length).toBe(3);
  });

  it("movimientos paginados 100 y filtros", async ()=>{
    for(const f of dataset100.slice(0,10)){
      await app.inject({ method:"POST", url:"/v1/transactions", headers:{"x-user-id":"demo"}, payload:{ merchant:f.merchant, amount:f.amount, type:f.type, date:f.date, category_id: CAT_IDS[f.category_slug] ?? null }});
    }
    const all = JSON.parse((await app.inject({ method:"GET", url:"/v1/transactions", headers:{"x-user-id":"demo"}})).body);
    expect(all.length).toBe(10);
    const filtered = JSON.parse((await app.inject({ method:"GET", url:`/v1/transactions?category_id=${CAT_IDS.supermercado}`, headers:{"x-user-id":"demo"}})).body);
    expect(filtered.every((t:any)=> t.category_id===CAT_IDS.supermercado)).toBe(true);
  });

  it("manual entry → confirmado, pendiente revisión no aplica en Phase 2", async ()=>{
    const res = await app.inject({ method:"POST", url:"/v1/transactions", headers:{"x-user-id":"demo"}, payload:{ merchant:"Manual Test", amount:1000, type:"expense", date:"2026-08-24"}});
    expect(JSON.parse(res.body).status).toBe("confirmed");
  });
});
