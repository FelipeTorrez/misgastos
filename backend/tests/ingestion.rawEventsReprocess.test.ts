import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/lib/supabase.js", () => ({
  supabase: { from: () => { throw new Error("supabase no debe usarse en mock mode"); } },
  getUserId: () => "user-test",
  isMockMode: true,
}));

import app from "../src/index.js";
import { mockStore } from "../src/lib/mockStore.js";

beforeEach(() => {
  mockStore.reset();
  delete (process.env as any).GROQ_API_KEY;
});

describe("Ingesta — raw_events sin gasto: listar pending y reprocesar", () => {
  it("sin monto → pending lo lista → reprocess devuelve 422 sin crear transacción", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/ingestion/email",
      payload: { raw_content: "Hola, tu resumen mensual", external_id: "no-amount-1" },
    });
    expect(res.statusCode).toBe(201);
    const j = JSON.parse(res.body);
    expect(j.transaction).toBeNull();
    const rawEventId = j.raw_event.id;

    const pending = await app.inject({ method: "GET", url: "/v1/raw-events?pending=1" });
    expect(pending.statusCode).toBe(200);
    const list = JSON.parse(pending.body);
    expect(Array.isArray(list)).toBe(true);
    expect(list.map((r: any) => r.id)).toContain(rawEventId);

    const reprocess = await app.inject({ method: "POST", url: `/v1/raw-events/${rawEventId}/reprocess` });
    expect(reprocess.statusCode).toBe(422);
    const rj = JSON.parse(reprocess.body);
    expect(rj.transaction).toBeNull();
    expect(rj.error).toBeTruthy();
    expect(rj.classification_source).toBe("no_amount");
    expect(mockStore.listTransactions("user-test")).toHaveLength(0);

    // metadata.reprocessed_at quedó marcada en el raw_event
    const stored = mockStore.getRawEvent(rawEventId, "user-test");
    expect(stored?.metadata?.reprocessed_at).toBeTruthy();
  });

  it("con monto + regla → reprocess crea tx (source 'rule') y el segundo POST devuelve already:true", async () => {
    mockStore.upsertRule("user-test", { merchant_normalized: "lider", preferred_category_id: "cat-alimentacion" });
    const raw = mockStore.insertRawEvent("user-test", {
      source: "gmail",
      external_id: "with-rule-1",
      sender: "santander@notificaciones.cl",
      subject: "Compra realizada",
      raw_content: "Compra por $32.990 en Lider con tarjeta terminada en 1234 - 24/08/2026 15:30 - Santander",
    });

    const pendingBefore = JSON.parse((await app.inject({ method: "GET", url: "/v1/raw-events?pending=1" })).body);
    expect(pendingBefore.map((r: any) => r.id)).toContain(raw.id);

    const first = await app.inject({ method: "POST", url: `/v1/raw-events/${raw.id}/reprocess` });
    expect(first.statusCode).toBe(200);
    const fj = JSON.parse(first.body);
    expect(fj.already).toBeUndefined();
    expect(fj.transaction).toBeDefined();
    expect(fj.transaction.amount).toBe(32990);
    expect(fj.transaction.raw_event_id).toBe(raw.id);
    expect(fj.transaction.source).toBe("rule");
    expect(fj.classification_source).toBe("rule");
    expect(mockStore.listTransactions("user-test")).toHaveLength(1);

    const second = await app.inject({ method: "POST", url: `/v1/raw-events/${raw.id}/reprocess` });
    expect(second.statusCode).toBe(200);
    const sj = JSON.parse(second.body);
    expect(sj.already).toBe(true);
    expect(sj.transaction.id).toBe(fj.transaction.id);
    expect(mockStore.listTransactions("user-test")).toHaveLength(1);

    // ya vinculado → deja de estar pendiente
    const pendingAfter = JSON.parse((await app.inject({ method: "GET", url: "/v1/raw-events?pending=1" })).body);
    expect(pendingAfter.map((r: any) => r.id)).not.toContain(raw.id);
  });

  it("pending excluye raw_events descartados por el guard de IA", async () => {
    const guarded = mockStore.insertRawEvent("user-test", {
      source: "gmail",
      raw_content: "Promo: 50% off en tu próxima compra",
      metadata: { guard: { is_transaction: false, reason: "promo_or_informational" } },
    });
    const list = JSON.parse((await app.inject({ method: "GET", url: "/v1/raw-events?pending=1" })).body);
    expect(list.map((r: any) => r.id)).not.toContain(guarded.id);

    const all = JSON.parse((await app.inject({ method: "GET", url: "/v1/raw-events" })).body);
    expect(all.map((r: any) => r.id)).toContain(guarded.id);
  });
});
