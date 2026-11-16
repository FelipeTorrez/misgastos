import { describe, it, expect, beforeEach, vi } from "vitest";

const store: Record<string, any[]> = { raw_events: [], transactions: [], categories: [{ id: "cat-otros", slug: "otros" }, { id: "cat-alim", slug: "alimentacion" }], accounts: [], rules: [] };
function reset(){ for(const k of Object.keys(store)) if(!["categories"].includes(k)) store[k]=[]; }
function query(table:string){
  let filters:any[]=[]; let inserts:any=null;
  const api:any={
    select:()=>api, eq:(c:string,v:any)=>{filters.push((r:any)=>r[c]===v); return api;}, is:()=>api, gte:()=>api, lt:()=>api, or:()=>api, order:()=>api, limit:()=>api,
    insert:(row:any)=>{inserts=row; return api;},
    update:(patch:any)=>({ eq:()=>({ eq:()=>Promise.resolve({error:null}) }), select:()=>api }),
    single: async()=>{
      if(inserts){
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

vi.mock("../src/lib/supabase.js", ()=>({ supabase:{from:(t:string)=>query(t)}, getUserId:()=>"user-test", isMockMode: false }));
import app from "../src/index.js";

// Sin API key el clasificador usa el fallback visible (determinístico, sin red)
delete (process.env as any).GROQ_API_KEY;

beforeEach(()=>{ reset(); delete (process.env as any).GROQ_API_KEY; });

describe("Ingesta — cola de revisión para procesadores de pago", ()=>{
  it("merchant 'MERPAGO MIGAS' => pending_review, sin categoría, motivo payment_processor", async ()=>{
    const res = await app.inject({ method:"POST", url:"/v1/ingestion/email", payload:{
      sender:"santander@notificaciones.cl", subject:"Compra realizada",
      raw_content:"Compra por $8.500 en Merpago Migas con tarjeta terminada en 1234 - 24/08/2026 15:30 - Santander",
      external_id:"pp-merpago-1"
    }});
    expect(res.statusCode).toBe(201);
    const j = JSON.parse(res.body);
    expect(j.transaction).toBeDefined();
    expect(j.transaction.status).toBe("pending_review");
    expect(j.transaction.status).not.toBe("confirmed");
    expect(j.transaction.category_id).toBeNull();
    expect(j.transaction.metadata.review_reason).toBe("payment_processor");
  });

  it("GET /v1/transactions expone review_reason top-level", async ()=>{
    await app.inject({ method:"POST", url:"/v1/ingestion/email", payload:{
      sender:"santander@notificaciones.cl", subject:"Compra realizada",
      raw_content:"Compra por $8.500 en Merpago Migas con tarjeta terminada en 1234 - 24/08/2026 15:30 - Santander",
      external_id:"pp-merpago-2"
    }});
    const list = await app.inject({ method:"GET", url:"/v1/transactions" });
    const arr = JSON.parse(list.body);
    expect(arr.length).toBe(1);
    expect(arr[0].review_reason).toBe("payment_processor");
  });

  it("merchant 'LIDER' con regla => camino normal (rule, sin motivo de procesador)", async ()=>{
    store.rules = [{ id: "rule-lider", user_id: "user-test", merchant_normalized: "lider", preferred_category_id: "cat-alim", preferred_merchant_alias: null, hits_count: 0 }];
    const res = await app.inject({ method:"POST", url:"/v1/ingestion/email", payload:{
      sender:"santander@notificaciones.cl", subject:"Compra realizada",
      raw_content:"Compra por $32.990 en Lider con tarjeta terminada en 1234 - 24/08/2026 15:30 - Santander",
      external_id:"pp-lider-1"
    }});
    expect(res.statusCode).toBe(201);
    const j = JSON.parse(res.body);
    expect(j.classification_source).toBe("rule");
    expect(j.transaction.status).toBe("pending_ai");
    expect(j.transaction.category_id).toBe("cat-alim");
    expect(j.transaction.metadata?.review_reason ?? null).toBeNull();
  });
});
