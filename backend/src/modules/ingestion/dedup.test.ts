import { describe, it, expect } from "vitest";
import { isDuplicate, squashMerchant } from "./dedup.js";

const baseExisting = [
  { id: "1", amount: 32990, date: "2026-08-24T15:30:00Z", merchant: "Lider", type: "expense", status: "confirmed" },
  { id: "2", amount: 250000, date: "2026-08-06T09:00:00Z", merchant: "Transferencia", type: "transfer", status: "confirmed" },
];

describe("Phase 5 — Deduplicación §15", () => {
  it("email + notificación mismo Lider 32.990 mismo día → duplicado", () => {
    const cand = { amount: 32990, date: "2026-08-24", time: "15:32", merchant: "Lider", type: "expense" };
    expect(isDuplicate(cand, baseExisting as any)?.id).toBe("1");
  });
  it("mismo monto distinto comercio → no duplicado", () => {
    const cand = { amount: 32990, date: "2026-08-24", merchant: "Jumbo", type: "expense" };
    expect(isDuplicate(cand, baseExisting as any)).toBeNull();
  });
  it("mismo comercio distinto monto → no duplicado", () => {
    const cand = { amount: 10000, date: "2026-08-24", merchant: "Lider", type: "expense" };
    expect(isDuplicate(cand, baseExisting as any)).toBeNull();
  });
  it("mismo todo distinto día → no duplicado", () => {
    const cand = { amount: 32990, date: "2026-08-25", merchant: "Lider", type: "expense" };
    expect(isDuplicate(cand, baseExisting as any)).toBeNull();
  });
  it("fuzzy merchant Lider Providencia vs Lider → duplicado", () => {
    const cand = { amount: 32990, date: "2026-08-24", merchant: "Lider Providencia", type: "expense" };
    expect(isDuplicate(cand, baseExisting as any)?.id).toBe("1");
  });
  it("ventana tiempo 60min: 15:30 vs 18:05 fuera ventana → no duplicado", () => {
    const cand = { amount: 32990, date: "2026-08-24", time: "18:05", merchant: "Lider", type: "expense" };
    expect(isDuplicate(cand, baseExisting as any, { windowMinutes: 60 })).toBeNull();
  });
  it("ventana 180min: 15:30 vs 18:05 dentro → duplicado", () => {
    const cand = { amount: 32990, date: "2026-08-24", time: "18:05", merchant: "Lider", type: "expense" };
    expect(isDuplicate(cand, baseExisting as any, { windowMinutes: 180 })?.id).toBe("1");
  });
  it("ignora transacciones ya marcadas duplicate", () => {
    const existing = [{ id: "dup", amount: 100, date: "2026-08-24T10:00:00Z", merchant: "Test", type: "expense", status: "duplicate" }];
    const cand = { amount: 100, date: "2026-08-24", merchant: "Test", type: "expense" };
    expect(isDuplicate(cand, existing as any)).toBeNull();
  });
  it("transferencia mismo monto → detecta", () => {
    const cand = { amount: 250000, date: "2026-08-06", merchant: "Transferencia", type: "transfer" };
    expect(isDuplicate(cand, baseExisting as any)?.id).toBe("2");
  });
});

describe("Dedup T1/T2/T3 — caso real RedGloba 17-nov ($5.200, 3s)", () => {
  // Fixtures reales: tx Falabella "Redgloba Break" 21:01:00 + evento Wallet
  // "RedGloba*BREAK CLP 5,200" que la IA propuso como "Red Global", 3s después.
  const redglobaExisting = [
    { id: "f01e82f7", amount: 5200, date: "2026-11-17T21:01:00Z", merchant: "Redgloba Break", type: "expense", status: "pending_ai" },
  ];

  it("squashMerchant quita espacios/guiones/puntuación", () => {
    expect(squashMerchant("Red Global")).toBe("redglobal");
    expect(squashMerchant("Redgloba Break")).toBe("redglobabreak");
    expect(squashMerchant("Red-Globa, BREAK.")).toBe("redglobabreak");
    expect(squashMerchant(null)).toBe("");
  });

  it("(a) 'Redgloba Break' vs 'Red Global', 5200, 3s → duplicado", () => {
    const cand = { amount: 5200, date: "2026-11-17", time: "21:01", merchant: "Red Global", type: "expense" };
    expect(isDuplicate(cand, redglobaExisting as any)?.id).toBe("f01e82f7");
  });

  it("(b) control negativo: 'Uber' vs 'Cabify', 5200, mismo minuto → duplicado SOLO por T3 (merchant-agnóstico, documentado)", () => {
    // T1/T2 no matchean ('uber' vs 'cabify' sin contención); T3 sí por |dt|<=90s.
    const existing = [
      { id: "u1", amount: 5200, date: "2026-11-17T21:01:00Z", merchant: "Uber", type: "expense", status: "confirmed" },
    ];
    const cand = { amount: 5200, date: "2026-11-17", time: "21:01", merchant: "Cabify", type: "expense" };
    expect(isDuplicate(cand, existing as any)?.id).toBe("u1");
  });

  it("(b) 'Uber' vs 'Cabify', 5200, 5 min aparte → NO duplicado", () => {
    const existing = [
      { id: "u1", amount: 5200, date: "2026-11-17T21:01:00Z", merchant: "Uber", type: "expense", status: "confirmed" },
    ];
    const cand = { amount: 5200, date: "2026-11-17", time: "21:06", merchant: "Cabify", type: "expense" };
    expect(isDuplicate(cand, existing as any)).toBeNull();
  });

  it("(c) regresión T1: 'Lider' vs 'Lider Express', 5200, 40 min → duplicado", () => {
    const existing = [
      { id: "l1", amount: 5200, date: "2026-11-17T15:30:00Z", merchant: "Lider", type: "expense", status: "confirmed" },
    ];
    const cand = { amount: 5200, date: "2026-11-17", time: "16:10", merchant: "Lider Express", type: "expense" };
    expect(isDuplicate(cand, existing as any)?.id).toBe("l1");
  });

  it("(d) distinto monto o distinto día → nunca duplicado", () => {
    const candMonto = { amount: 5201, date: "2026-11-17", time: "21:01", merchant: "Red Global", type: "expense" };
    expect(isDuplicate(candMonto, redglobaExisting as any)).toBeNull();
    const candDia = { amount: 5200, date: "2026-11-18", time: "21:01", merchant: "Red Global", type: "expense" };
    expect(isDuplicate(candDia, redglobaExisting as any)).toBeNull();
  });

  it("(e) ambos merchants null, mismo monto, mismo minuto → duplicado (T3)", () => {
    const existing = [
      { id: "n1", amount: 5200, date: "2026-11-17T21:01:00Z", merchant: null, type: "expense", status: "confirmed" },
    ];
    const cand = { amount: 5200, date: "2026-11-17", time: "21:01", merchant: null, type: "expense" };
    expect(isDuplicate(cand, existing as any)?.id).toBe("n1");
  });

  it("(e) merchants null, mismo monto, 5 min aparte → NO duplicado", () => {
    const existing = [
      { id: "n1", amount: 5200, date: "2026-11-17T21:01:00Z", merchant: null, type: "expense", status: "confirmed" },
    ];
    const cand = { amount: 5200, date: "2026-11-17", time: "21:06", merchant: null, type: "expense" };
    expect(isDuplicate(cand, existing as any)).toBeNull();
  });
});
