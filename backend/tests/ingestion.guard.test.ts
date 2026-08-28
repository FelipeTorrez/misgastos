import { describe, it, expect, beforeEach, vi } from "vitest";

const store: Record<string, any[]> = { raw_events: [], transactions: [], categories: [{ id: "cat-otros", slug: "otros" }, { id: "cat-super", slug: "supermercado" }], accounts: [], rules: [] };
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
import { parseEmail } from "../src/modules/ingestion/parser.js";
import { GroqProvider } from "../src/ai/providers/GroqProvider.js";
import { isAllowlisted } from "../src/modules/ingestion/allowlist.js";

beforeEach(()=> reset());

describe("SDD Notification Guard — parser CLP + allowlist + IA guard", ()=>{
  it("parser CLP1,250 con coma miles → 1250", ()=>{
    const p = parseEmail("CLP1,250 con CMR Mastercard Contactless **6592");
    expect(p.amount).toBe(1250);
    expect(p.last4).toBe("6592");
  });
  it("parser $750.000 cupo → 750000 pero banco detectado", ()=>{
    const p = parseEmail("tienes un nuevo cupo aprobado por $750.000 abre aqui tu banco de chile");
    expect(p.amount).toBe(750000);
    expect(p.bank).toBe("Banco de Chile");
  });
  it("parser Falabella $1.300 → 1300", ()=>{
    const p = parseEmail("Compraste $1.300 en ANGAROA Santiago con tu CMR");
    expect(p.amount).toBe(1300);
    expect(p.merchant).toContain("ANGAROA");
  });

  it("allowlist incluye gms (Wallet via GMS)", ()=>{
    expect(isAllowlisted("com.google.android.gms")).toBe(true);
    expect(isAllowlisted("com.google.android.apps.walletnfcrel")).toBe(true);
    expect(isAllowlisted("cl.android")).toBe(true);
    expect(isAllowlisted("com.whatsapp")).toBe(false);
  });

  it("mock guard: promo cupo → is_transaction false", async ()=>{
    const prov = new GroqProvider() as any;
    const out = await prov.mock({ normalized_text: "tienes un nuevo cupo aprobado por 750.000 abre aqui banco de chile", parser_hints:{ amount:750000 }, categories:["otros"], user_rules:[], locale:"es-CL" }, "test");
    expect(out.is_transaction).toBe(false);
    expect(out.transaction_type).toBe("none");
    expect(out.reason).toContain("promo");
    expect(out.amount).toBe(0);
  });

  it("POST /v1/ingestion/notification promo cupo 750k → transaction null (guard bloquea)", async ()=>{
    const res = await app.inject({ method:"POST", url:"/v1/ingestion/notification", payload:{
      raw_content:"Banco de Chile: tienes un nuevo cupo aprobado por $750.000 abre aqui para solicitarlo",
      sender:"cl.bancochile", subject:"Cupo aprobado", external_id:"notif-promo-750k"
    }});
    const j = JSON.parse(res.body);
    expect(j.transaction).toBeNull();
    expect(j.classification_source).toBe("ai_guard");
    expect(j.ignored_reason).toContain("promo");
    expect(j.ai.is_transaction).toBe(false);
    expect(j.sender_allowlisted).toBe(true);
  });

  it("POST /v1/ingestion/notification CLP1,250 via gms → crea transaction 1250", async ()=>{
    const res = await app.inject({ method:"POST", url:"/v1/ingestion/notification", payload:{
      raw_content:"Billetera de Google CLP1,250 con CMR Mastercard Contactless **6592",
      sender:"com.google.android.gms", subject:"Compra", external_id:"notif-gms-1250"
    }});
    const j = JSON.parse(res.body);
    expect(j.parsed.amount).toBe(1250);
    expect(j.transaction).toBeDefined();
    expect(j.transaction.amount).toBe(1250);
    expect(j.sender_allowlisted).toBe(true);
    expect(j.classification_source).not.toBe("ai_guard");
  });

  it("POST /v1/ingestion/notification Falabella $1.300 → expense 1300", async ()=>{
    const res = await app.inject({ method:"POST", url:"/v1/ingestion/notification", payload:{
      raw_content:"Compraste $1.300 en ANGAR... con tu CMR Mastercard Clásica terminada en 6592. Si no la realizaste tú...",
      sender:"cl.android", subject:"Compra", external_id:"notif-fala-1300"
    }});
    const j = JSON.parse(res.body);
    expect(j.transaction).toBeDefined();
    expect(j.transaction.amount).toBe(1300);
    expect(j.sender_allowlisted).toBe(true);
  });

  it("POST sin monto → no_amount, no llama IA, transaction null", async ()=>{
    const res = await app.inject({ method:"POST", url:"/v1/ingestion/notification", payload:{
      raw_content:"Hola, tu resumen mensual sin consumo", sender:"cl.bancochile", external_id:"notif-nomonto"
    }});
    const j = JSON.parse(res.body);
    expect(j.transaction).toBeNull();
    expect(j.classification_source).toBe("no_amount");
    expect(j.next).toContain("no amount");
  });
});
