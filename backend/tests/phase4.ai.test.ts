import { describe, it, expect, vi } from "vitest";

vi.mock("../src/lib/supabase.js", () => {
  const store: any = { raw_events: [], transactions: [], categories: [{ id: "cat-super", slug: "alimentacion" }, { id: "cat-sus", slug: "suscripciones" }], rules: [] };
  const query = (table:string) => {
    let inserts:any=null;
    return {
      select:()=>({ eq:()=>({ eq:()=>({ eq:()=>({ single: async()=>({data:null}) }) }), limit:()=>({ single: async()=>({data:null}) }) }), limit:()=>({ single: async()=>({data:null}) }), order:()=>({ limit: async()=>({data:[]}) }) }),
      from: (t:string)=> query(t),
      insert:(row:any)=>{ inserts=row; return { select:()=>({ single: async()=>{ const r={id:"mock-id",...row}; store[table].push(r); return {data:r,error:null}; }}) }; },
      then:(cb:any)=> cb({data:[],error:null})
    } as any;
  };
  return { supabase:{ from:(t:string)=> query(t) }, getUserId:()=>"u1", isMockMode: false };
});

// Mock simple para este test: usa mock provider directo
import { createAIProvider } from "../src/ai/providers/AIProvider.js";

describe("Phase 4 — AI via ingestion (mock Groq)", () => {
  it("createAIProvider groq y mock", async () => {
    const groq = createAIProvider("groq");
    const mock = createAIProvider("mock");
    expect(groq).toBeDefined(); expect(mock).toBeDefined();
  });
  it("mock clasifica Lider -> alimentacion", async () => {
    const p = createAIProvider("mock");
    const out = await p.classify({ normalized_text: "compra en lider", parser_hints: { amount: 32990, merchant_guess: "Lider" }, categories: ["alimentacion","otros"], user_rules: [], locale: "es-CL" });
    expect(out.category).toBe("alimentacion");
    expect(out.amount).toBe(32990);
    expect(out.needs_review).toBe(false);
  });
  it("abstención si sin monto", async () => {
    const p = createAIProvider("mock");
    const out = await p.classify({ normalized_text: "hola", parser_hints: {}, categories: ["otros"], user_rules: [], locale: "es-CL" });
    expect(out.needs_review).toBe(true);
    expect(out.confidence).toBe(0.5);
  });
});
