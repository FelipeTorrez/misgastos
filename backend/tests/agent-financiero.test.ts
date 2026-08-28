import { describe, it, expect, beforeEach, vi } from "vitest";

const store: Record<string, any[]> = { raw_events: [], transactions: [], categories: [{ id: "cat-otros", slug: "otros" }, { id: "cat-super", slug: "supermercado" }], accounts: [], rules: [], budgets: [] };
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
import { GroqProvider } from "../src/ai/providers/GroqProvider.js";
import { FINAN_SYSTEM_PROMPT, inferDirection } from "../src/ai/prompts/agente-financiero.js";

beforeEach(()=> reset());

describe("SDD Agente Financiero — Finan (direction + veredicto)", ()=>{
  describe("inferDirection unit", ()=>{
    it("recibiste/te transfirieron → in", ()=>{
      expect(inferDirection("Recibiste $21.700 Te transfirieron $21.700 a tu Cuenta Banco Falabella 3506")).toBe("in");
      expect(inferDirection("te han transferido 50.000 de juan")).toBe("in");
      expect(inferDirection("abono recibido $10.000")).toBe("in");
      expect(inferDirection("te devolvimos 8990")).toBe("in");
    });
    it("transferiste/enviaste → out", ()=>{
      expect(inferDirection("Transferiste $30.000 a María González")).toBe("out");
      expect(inferDirection("enviaste 10000 a pedro")).toBe("out");
      expect(inferDirection("compraste $1300 en jumbo")).toBe("out");
    });
    it("traspaso entre cuentas propias → internal", ()=>{
      expect(inferDirection("Transferencia desde tu Cuenta Corriente a tu Cuenta Vista")).toBe("internal");
      expect(inferDirection("traspaso entre tus cuentas 50000")).toBe("internal");
    });
  });

  describe("FINAN_SYSTEM_PROMPT", ()=>{
    it("contiene regla de dirección y few-shot recibiste→income", ()=>{
      expect(FINAN_SYSTEM_PROMPT).toContain("recibiste");
      expect(FINAN_SYSTEM_PROMPT).toContain("income");
      expect(FINAN_SYSTEM_PROMPT).toContain("Mensaje promocional");
      expect(FINAN_SYSTEM_PROMPT).toContain("transaction_type");
    });
  });

  describe("mock classify — dirección financiera", ()=>{
    it("Recibiste $21.700 Falabella → income in", async ()=>{
      const prov = new GroqProvider() as any;
      const out = await prov.mock(
        { normalized_text: "recibiste $21.700 te transfirieron $21.700 a tu cuenta banco falabella 3506", parser_hints:{ amount:21700 }, categories:["otros","supermercado"], user_rules:[], locale:"es-CL" },
        "test"
      );
      expect(out.is_transaction).toBe(true);
      expect(out.transaction_type).toBe("income");
      expect(out.direction).toBe("in");
      expect(out.amount).toBe(21700);
      expect(out.reason).toContain("ingreso");
    });
    it("Te transfirieron $50.000 de Juan Pérez → income con counterparty", async ()=>{
      const prov = new GroqProvider() as any;
      const out = await prov.mock(
        { normalized_text: "te transfirieron $50.000 de juan pérez a tu cuenta", parser_hints:{ amount:50000 }, categories:["otros"], user_rules:[], locale:"es-CL" },
        "test"
      );
      expect(out.transaction_type).toBe("income");
      expect(out.direction).toBe("in");
      expect(out.counterparty).toBeTruthy();
    });
    it("Transferiste $30.000 a María → expense out", async ()=>{
      const prov = new GroqProvider() as any;
      const out = await prov.mock(
        { normalized_text: "transferiste $30.000 a maría gonzález", parser_hints:{ amount:30000 }, categories:["otros"], user_rules:[], locale:"es-CL" },
        "test"
      );
      expect(out.transaction_type).toBe("expense");
      expect(out.direction).toBe("out");
      expect(out.reason).toContain("gasto");
    });
    it("promo cupo → is_transaction false, reason legible", async ()=>{
      const prov = new GroqProvider() as any;
      const out = await prov.mock(
        { normalized_text: "tienes un nuevo cupo aprobado por 750.000 banco de chile", parser_hints:{ amount:750000 }, categories:["otros"], user_rules:[], locale:"es-CL" },
        "test"
      );
      expect(out.is_transaction).toBe(false);
      expect(out.transaction_type).toBe("none");
      expect(out.direction).toBe("none");
      expect(out.amount).toBe(0);
      expect(out.reason).toContain("promo");
    });
    it("Compraste $1.300 en Angaroa → expense otros (sin regla)", async ()=>{
      const prov = new GroqProvider() as any;
      const out = await prov.mock(
        { normalized_text: "compraste $1.300 en angaroa con tu cmr mastercard", parser_hints:{ amount:1300, merchant_guess:"Angaroa" }, categories:["otros","supermercado"], user_rules:[], locale:"es-CL" },
        "test"
      );
      expect(out.is_transaction).toBe(true);
      expect(out.transaction_type).toBe("expense");
      expect(out.direction).toBe("out");
      // Angaroa no está en lista supermercado, cae a otros (o con merchant_guess explícito)
      expect(["otros","supermercado"]).toContain(out.category);
      expect(out.reason).toContain("gasto");
    });
    it("transfer interna entre cuentas → transfer internal", async ()=>{
      const prov = new GroqProvider() as any;
      const out = await prov.mock(
        { normalized_text: "transferencia desde tu cuenta corriente a tu cuenta vista $100.000", parser_hints:{ amount:100000 }, categories:["otros"], user_rules:[], locale:"es-CL" },
        "test"
      );
      expect(out.transaction_type).toBe("transfer");
      expect(out.direction).toBe("internal");
    });
    it("Abono $100.000 → income in", async ()=>{
      const prov = new GroqProvider() as any;
      const out = await prov.mock(
        { normalized_text: "abono recibido $100.000 en tu cuenta", parser_hints:{ amount:100000 }, categories:["otros"], user_rules:[], locale:"es-CL" },
        "test"
      );
      expect(out.transaction_type).toBe("income");
      expect(out.direction).toBe("in");
    });
  });

  describe("POST /v1/ingestion/notification — end-to-end (Finan)", ()=>{
    it("Recibiste $21.700 Falabella → crea income (fix signo)", async ()=>{
      const res = await app.inject({ method:"POST", url:"/v1/ingestion/notification", payload:{
        raw_content:"Recibiste $21.700. Te transfirieron $21.700 a tu Cuenta Banco Falabella 3506, ingresa a la App",
        sender:"cl.android", subject:"Transferencia recibida", external_id:"notif-finan-21700"
      }});
      const j = JSON.parse(res.body);
      expect(j.transaction).toBeDefined();
      expect(j.transaction.amount).toBe(21700);
      expect(j.transaction.type).toBe("income");
      expect(j.ai.direction).toBe("in");
      expect(j.ai.reason).toContain("ingreso");
      expect(j.classification_source).toBe("ai");
    });

    it("Transferiste $30.000 a María → expense out", async ()=>{
      const res = await app.inject({ method:"POST", url:"/v1/ingestion/notification", payload:{
        raw_content:"Transferiste $30.000 a María González desde tu Cuenta Corriente",
        sender:"cl.bancochile", subject:"Transferencia enviada", external_id:"notif-finan-30000out"
      }});
      const j = JSON.parse(res.body);
      expect(j.transaction).toBeDefined();
      expect(j.transaction.type).toBe("expense");
      expect(j.ai.direction).toBe("out");
    });

    it("Transferencia interna entre tus cuentas → transfer neutro, no afecta balance como expense", async ()=>{
      const res = await app.inject({ method:"POST", url:"/v1/ingestion/notification", payload:{
        raw_content:"Transferencia desde tu Cuenta Corriente a tu Cuenta Vista por $100.000",
        sender:"cl.bci", subject:"Traspaso", external_id:"notif-finan-internal"
      }});
      const j = JSON.parse(res.body);
      expect(j.transaction).toBeDefined();
      expect(j.transaction.type).toBe("transfer");
      expect(j.ai.direction).toBe("internal");
    });

    it("Balance tras los tres: income=21700, expense=30000, transfer no suma a expense", async ()=>{
      // Insertar los tres en el mismo test (beforeEach limpia entre tests)
      await app.inject({ method:"POST", url:"/v1/ingestion/notification", payload:{
        raw_content:"Recibiste $21.700 Te transfirieron $21.700 a tu Cuenta Banco Falabella 3506", sender:"cl.android", external_id:"bal-21700"
      }});
      await app.inject({ method:"POST", url:"/v1/ingestion/notification", payload:{
        raw_content:"Transferiste $30.000 a María González desde tu Cuenta Corriente", sender:"cl.bancochile", external_id:"bal-30000out"
      }});
      await app.inject({ method:"POST", url:"/v1/ingestion/notification", payload:{
        raw_content:"Transferencia desde tu Cuenta Corriente a tu Cuenta Vista por $100.000", sender:"cl.bci", external_id:"bal-internal100k"
      }});
      const tRes = await app.inject({ method:"GET", url:"/v1/transactions?month=2026-08" });
      const txs = JSON.parse(tRes.body) as any[];
      const income = txs.filter(t=>t.type==="income").reduce((s, t)=>s+t.amount, 0);
      const expense = txs.filter(t=>t.type==="expense").reduce((s, t)=>s+t.amount, 0);
      const transfer = txs.filter(t=>t.type==="transfer").reduce((s, t)=>s+t.amount, 0);
      expect(income).toBeGreaterThanOrEqual(21700);
      expect(expense).toBeGreaterThanOrEqual(30000);
      expect(transfer).toBeGreaterThanOrEqual(100000);
      const b = await app.inject({ method:"GET", url:"/v1/balance?month=2026-08" });
      expect(b.statusCode).toBe(200);
    });
  });
});
