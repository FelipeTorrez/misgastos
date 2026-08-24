import { describe, it, expect, beforeEach, vi } from "vitest";

const store: Record<string, any[]> = { raw_events: [], transactions: [], categories: [{ id: "cat-otros", slug: "otros" }], accounts: [] };
function reset(){ for(const k of Object.keys(store)) if(k!=="categories") store[k]=[]; }
function query(table:string){
  let filters:any[]=[]; let inserts:any=null;
  const api:any={
    select:()=>api, eq:(c:string,v:any)=>{filters.push((r:any)=>r[c]===v); return api;}, is:()=>api, gte:()=>api, lt:()=>api, or:(q:string)=>{ // simple or for categories
      // q like "slug.eq.otros,slug.eq.otros" -> match any
      return api; }, order:()=>api, limit:()=>api,
    insert:(row:any)=>{inserts=row; return api;},
    single: async()=>{
      if(inserts){
        // idempotencia check ya hecho antes, aquí solo inserta
        const row={ id: crypto.randomUUID(), ...inserts, created_at: new Date().toISOString() };
        store[table].push(row); inserts=null; return {data:row, error:null};
      }
      const found=store[table].find(r=>filters.every((fn:any)=>fn(r)));
      return {data: found ?? null, error:null};
    },
    then:(resolve:any)=>{
      let rows=[...store[table]];
      for(const f of filters) rows=rows.filter(f);
      resolve({data:rows, error:null});
    }
  };
  return api;
}

vi.mock("../src/lib/supabase.js", ()=>({ supabase:{from:(t:string)=>query(t)}, getUserId:()=>"user-test" }));
import app from "../src/index.js";

beforeEach(()=> reset());

describe("Phase 3 — Ingestion Email §11.1 → RawEvent §12 → Parser §14", ()=>{
  it("POST /v1/ingestion/email crea RawEvent + Transaction (Lider §37)", async ()=>{
    const res = await app.inject({ method:"POST", url:"/v1/ingestion/email", payload:{
      sender:"santander@notificaciones.cl", subject:"Compra realizada",
      raw_content:"Compra por $32.990 en Lider con tarjeta terminada en 1234 - 24/08/2026 15:30 - Santander",
      external_id:"gmail-123"
    }});
    expect(res.statusCode).toBe(201);
    const j = JSON.parse(res.body);
    expect(j.raw_event).toBeDefined();
    expect(j.parsed.amount).toBe(32990);
    expect(j.parsed.merchant).toBe("Lider");
    expect(j.transaction).toBeDefined();
    expect(j.transaction.amount).toBe(32990);
    expect(j.transaction.status).toBe("pending_ai");
  });

  it("idempotencia por external_id (duplicate email ignored)", async ()=>{
    await app.inject({ method:"POST", url:"/v1/ingestion/email", payload:{ raw_content:"Compra $10.000 en Test", external_id:"dup-1"}});
    const dup = await app.inject({ method:"POST", url:"/v1/ingestion/email", payload:{ raw_content:"Compra $10.000 en Test", external_id:"dup-1"}});
    expect(dup.statusCode).toBe(200);
    expect(JSON.parse(dup.body).dedup).toBe(true);
  });

  it("sin monto -> no crea transaction, necesita revisión manual", async ()=>{
    const res = await app.inject({ method:"POST", url:"/v1/ingestion/email", payload:{ raw_content:"Hola, tu resumen mensual"}});
    const j = JSON.parse(res.body);
    expect(j.transaction).toBeNull();
    expect(j.next).toContain("needs manual");
    expect(j.parsed.confidence).toBe(0.5);
  });

  it("transferencia recibida $250k", async ()=>{
    const res = await app.inject({ method:"POST", url:"/v1/ingestion/email", payload:{
      raw_content:"Transferencia recibida Monto: $250.000 - 06/08/2026 - BancoEstado", external_id:"tr-1"
    }});
    const j = JSON.parse(res.body);
    expect(j.parsed.operation).toBe("transfer");
    expect(j.parsed.amount).toBe(250000);
    expect(j.transaction.type).toBe("transfer");
  });

  it("GET /v1/raw-events lista auditoría", async ()=>{
    await app.inject({ method:"POST", url:"/v1/ingestion/email", payload:{ raw_content:"Compra $5.000 en Test"}});
    const res = await app.inject({ method:"GET", url:"/v1/raw-events"});
    expect(JSON.parse(res.body).length).toBe(1);
  });

  it("normalize oculta RUT y trunca 500", async ()=>{
    const raw = "RUT 12.345.678-9 compra $10.000 " + "x".repeat(600);
    const res = await app.inject({ method:"POST", url:"/v1/ingestion/email", payload:{ raw_content: raw }});
    const j = JSON.parse(res.body);
    expect(j.normalized).not.toContain("12.345.678-9");
    expect(j.normalized).toContain("[RUT]");
    expect(j.normalized.length).toBeLessThanOrEqual(500);
  });
});
