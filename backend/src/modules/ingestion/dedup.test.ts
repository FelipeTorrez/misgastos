import { describe, it, expect } from "vitest";
import { isDuplicate, squashMerchant, isBetterClassification, betterClassificationPatch, dedupKey } from "./dedup.js";

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

describe("Dedup key atómica (migración 008) — md5(amount|type|merchant|YYYY-MM-DD HH:MM)", () => {
  const base = { amount: 1300, type: "expense", merchant: "Redgloba Break", date: "2026-11-22", time: "23:27" };

  it("mismo monto, merchant y minuto → misma clave (el caso RedGloba 38 ms)", () => {
    expect(dedupKey(base)).toBe(dedupKey({ ...base }));
    // Puntuación/espacios distintos entre canales no cambian la huella.
    expect(dedupKey({ ...base, merchant: "redgloba*BREAK" })).toBe(dedupKey(base));
  });

  it("mismo monto y merchant en minutos distintos → claves distintas", () => {
    expect(dedupKey({ ...base, time: "23:28" })).not.toBe(dedupKey(base));
    expect(dedupKey({ ...base, time: "23:27" })).not.toBe(dedupKey({ ...base, time: "23:26" }));
  });

  it("distinto monto / type / día → claves distintas", () => {
    expect(dedupKey({ ...base, amount: 1301 })).not.toBe(dedupKey(base));
    expect(dedupKey({ ...base, type: "transfer" })).not.toBe(dedupKey(base));
    expect(dedupKey({ ...base, date: "2026-11-23" })).not.toBe(dedupKey(base));
  });

  it("acepta HH:MM:SS y lo reduce al minuto", () => {
    expect(dedupKey({ ...base, time: "23:27:02" })).toBe(dedupKey(base));
  });

  it("sin hora en el texto usa el minuto de receivedAt", () => {
    const sinHora = { ...base, time: null };
    expect(dedupKey({ ...sinHora, receivedAt: "2026-11-22T23:27:02.543Z" }))
      .toBe(dedupKey({ ...sinHora, receivedAt: "2026-11-22T23:27:02.581Z" }));
    expect(dedupKey({ ...sinHora, receivedAt: "2026-11-22T23:27:02.543Z" }))
      .not.toBe(dedupKey({ ...sinHora, receivedAt: "2026-11-22T23:28:00.000Z" }));
  });

  it("sin hora ni receivedAt, sin monto o type 'none' → null (no participa del índice)", () => {
    expect(dedupKey({ ...base, time: null })).toBeNull();
    expect(dedupKey({ ...base, amount: null })).toBeNull();
    expect(dedupKey({ ...base, type: "none" })).toBeNull();
  });
});

describe("Dedup — al unir filas gana la mejor clasificación (caso Frida Kahlo 22-nov)", () => {
  // Caso real: Wallet (IA 0.90 → Otros) llegó 1,1s antes que Falabella
  // (IA 0.95 → Compras). La dedup conservaba la primera aunque fuera peor.
  const survivor = {
    id: "fh-wallet",
    amount: 32620,
    date: "2026-11-22T20:53:00Z",
    merchant: "Frida Kahlo",
    type: "expense",
    status: "confirmed",
    category_id: "cat-otros",
    source: "ai",
    confidence: 0.9,
  };

  it("(a) superviviente ai 0.90 Otros + candidato ai 0.95 Compras → gana Compras 0.95", () => {
    const cand = { category_id: "cat-compras", source: "ai", confidence: 0.95, merchant: "Frida Kahlo" };
    expect(isBetterClassification(cand, survivor)).toBe(true);
    expect(betterClassificationPatch(cand, survivor)).toMatchObject({
      category_id: "cat-compras",
      source: "ai",
      confidence: 0.95,
    });
  });

  it("(b) superviviente rule + candidato ai 0.99 → no se toca (la regla manda)", () => {
    const ruleSurvivor = { ...survivor, source: "rule", confidence: 1 };
    const cand = { category_id: "cat-compras", source: "ai", confidence: 0.99, merchant: "Frida Kahlo" };
    expect(isBetterClassification(cand, ruleSurvivor)).toBe(false);
    expect(betterClassificationPatch(cand, ruleSurvivor)).toBeNull();
  });

  it("(c) superviviente 'corrected' → nunca se pisa una corrección manual", () => {
    const corrected = { ...survivor, status: "corrected" };
    const cand = { category_id: "cat-compras", source: "ai", confidence: 0.99, merchant: "Frida Kahlo" };
    expect(betterClassificationPatch(cand, corrected)).toBeNull();
  });

  it("(d) candidato con confianza menor → no se toca", () => {
    const cand = { category_id: "cat-otros", source: "ai", confidence: 0.8, merchant: "Frida Kahlo" };
    expect(isBetterClassification(cand, survivor)).toBe(false);
    expect(betterClassificationPatch(cand, survivor)).toBeNull();
  });

  it("empate exacto (mismo source y confidence) → no se toca", () => {
    const cand = { category_id: "cat-compras", source: "ai", confidence: 0.9, merchant: "Frida Kahlo" };
    expect(betterClassificationPatch(cand, survivor)).toBeNull();
  });

  it("rule sobre rule con más confidence sí actualiza", () => {
    const ruleSurvivor = { ...survivor, source: "rule", confidence: 0.95 };
    const cand = { category_id: "cat-compras", source: "rule", confidence: 1, merchant: "Frida Kahlo" };
    expect(betterClassificationPatch(cand, ruleSurvivor)).toMatchObject({ category_id: "cat-compras", confidence: 1 });
  });

  it("merchant más específico del candidato se propaga; el genérico no", () => {
    const cand = { category_id: "cat-compras", source: "ai", confidence: 0.95, merchant: "Frida Kahlo Providencia" };
    expect(betterClassificationPatch(cand, survivor)?.merchant).toBe("Frida Kahlo Providencia");
    const generic = { ...cand, merchant: "Desconocido" };
    expect(betterClassificationPatch(generic, survivor)?.merchant).toBeUndefined();
  });

  it("superviviente sin source/confidence (parser) pierde contra IA", () => {
    const parserSurvivor = { ...survivor, source: "parser", confidence: 0.3 };
    const cand = { category_id: "cat-compras", source: "ai", confidence: 0.7, merchant: "Frida Kahlo" };
    expect(betterClassificationPatch(cand, parserSurvivor)).toMatchObject({ category_id: "cat-compras", source: "ai" });
  });
});
