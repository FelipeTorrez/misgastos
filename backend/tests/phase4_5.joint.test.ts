import { describe, it, expect } from "vitest";
import { parseEmail } from "../src/modules/ingestion/parser.js";
import { createAIProvider } from "../src/ai/providers/AIProvider.js";
import { isDuplicate } from "../src/modules/ingestion/dedup.js";

describe("Conjunta 4+5 — AI categoriza y dedup no duplica (pipeline directo)", ()=>{
  it("Parser Lider + AI supermercado", async ()=>{
    const p = parseEmail("Compra por $32.990 en Lider - 24/08/2026 15:30");
    expect(p.amount).toBe(32990);
    const ai = await createAIProvider("mock").classify({
      normalized_text: "compra en lider",
      parser_hints: { amount: p.amount!, date: p.date!, merchant_guess: p.merchant! },
      categories: ["supermercado","suscripciones","otros"],
      user_rules: [],
      locale: "es-CL"
    });
    expect(ai.category).toBe("supermercado");
    expect(ai.confidence).toBeGreaterThan(0.5);
  });

  it("email Lider + notificación mismo Lider → dedup (con AI)", async ()=>{
    const p1 = parseEmail("Compra por $32.990 en Lider - 24/08/2026 15:30");
    const ai1 = await createAIProvider("mock").classify({
      normalized_text: "compra en lider",
      parser_hints: { amount: p1.amount!, date: p1.date!, merchant_guess: p1.merchant! },
      categories: ["supermercado","otros"],
      user_rules: [],
      locale: "es-CL"
    });
    const existing = [{ id:"orig-1", amount: ai1.amount, date:"2026-08-24T15:30:00Z", merchant: ai1.merchant, type:"expense", status:"confirmed"}];
    const p2 = parseEmail("Compra por $32.990 en Lider - 24/08/2026 15:32");
    const ai2 = await createAIProvider("mock").classify({
      normalized_text: "compra en lider",
      parser_hints: { amount: p2.amount!, date: p2.date!, merchant_guess: p2.merchant! },
      categories: ["supermercado","otros"],
      user_rules: [],
      locale: "es-CL"
    });
    const cand = { amount: ai2.amount, date: p2.date, time: p2.time, merchant: ai2.merchant, type:"expense" };
    const dup = isDuplicate(cand as any, existing as any);
    expect(dup?.id).toBe("orig-1");
    expect(ai1.category).toBe("supermercado");
    expect(ai2.category).toBe("supermercado");
  });

  it("distinto comercio no dedupa aunque misma AI categoría", async ()=>{
    const existing = [{ id:"orig", amount:32990, date:"2026-08-24T15:30:00Z", merchant:"Lider", type:"expense", status:"confirmed"}];
    const p = parseEmail("Compra por $32.990 en Jumbo - 24/08/2026 15:30");
    const cand = { amount: p.amount!, date: p.date, merchant: p.merchant, type:"expense" };
    expect(isDuplicate(cand as any, existing as any)).toBeNull();
  });

  it("Spotify → suscripciones + recurring, duplica si se repite mismo día", async ()=>{
    const p1 = parseEmail("Compra por $7.490 en Spotify - 24/08/2026 10:00");
    const ai1 = await createAIProvider("mock").classify({
      normalized_text: "spotify",
      parser_hints: { amount: p1.amount!, merchant_guess: p1.merchant! },
      categories: ["suscripciones","otros"],
      user_rules: [],
      locale: "es-CL"
    });
    expect(ai1.category).toBe("suscripciones");
    expect(ai1.is_recurring_candidate).toBe(true);
    const p2 = parseEmail("Compra por $7.490 en Spotify - 24/08/2026 10:02");
    const cand = { amount: p2.amount!, date: p2.date, time: p2.time, merchant: p2.merchant, type:"expense" };
    const dup = isDuplicate(cand as any, [{ id:"s1", amount:7490, date:"2026-08-24T10:00:00Z", merchant:"Spotify", type:"expense", status:"confirmed"}] as any);
    expect(dup?.id).toBe("s1");
  });

  it("$45000 sin punto + AI + dedup $45.000 con punto", async ()=>{
    const p1 = parseEmail("Compra por $45000 en Lider - 24/08/2026 12:00");
    const p2 = parseEmail("Compra por $45.000 en Lider - 24/08/2026 12:01");
    expect(p1.amount).toBe(45000);
    expect(p2.amount).toBe(45000);
    const cand = { amount: p2.amount!, date: p2.date, time: p2.time, merchant: p2.merchant, type:"expense" };
    const dup = isDuplicate(cand as any, [{ id:"orig", amount:45000, date:"2026-08-24T12:00:00Z", merchant:"Lider", type:"expense", status:"confirmed"}] as any);
    expect(dup?.id).toBe("orig");
  });
});
