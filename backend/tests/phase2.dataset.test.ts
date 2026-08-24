import { describe, it, expect } from "vitest";
import { dataset100, expectedTotals } from "../../tests/fixtures/dataset100.js";

describe("Phase 2 — Dataset 100 validaciones financieras", () => {
  it("dataset tiene 100 filas", () => expect(dataset100.length).toBe(100));
  it("totales pre-calculados coinciden con dataset", () => {
    let income=0, expense=0, transfer=0;
    for (const t of dataset100) {
      if (t.type==="income") income+=t.amount;
      else if (t.type==="expense") expense+=t.amount;
      else transfer+=t.amount;
    }
    expect(income).toBe(expectedTotals.income);
    expect(expense).toBe(expectedTotals.expense);
    expect(transfer).toBe(expectedTotals.transfer);
    expect(expectedTotals.balance).toBe(income-expense);
  });
  it("transfer 150.000 no afecta balance (ADR-002)", () => {
    expect(expectedTotals.transfer).toBe(150000);
    expect(expectedTotals.balance).toBe(expectedTotals.income - expectedTotals.expense);
  });
  it("income 3.050.000 exacto (incluye bono 95k)", () => expect(expectedTotals.income).toBe(3050000));
  it("sin investment en account_type", () => {
    expect(dataset100.every(t=> t.account_type !== "investment")).toBe(true);
  });
  it("cuotas solo como categoría deudas, no como installment", () => {
    // dataset no debe tener installments, solo deudas como expense categoría
    expect(dataset100.filter(t=> t.category_slug==="deudas").length).toBe(3);
    expect(dataset100.every(t=> t.category_slug !== "cuotas")).toBe(true);
  });
  it("fechas todas agosto 2026", () => {
    for (const t of dataset100) expect(t.date.startsWith("2026-08-")).toBe(true);
  });
  it("balance semanal suma = balance mensual", () => {
    // simula weekly de balance/routes.ts con UTC
    const weeks: Record<string, {income:number, expense:number}> = {};
    for (const t of dataset100) {
      if (t.type==="transfer") continue;
      const d = new Date(t.date+"T12:00:00Z");
      const w = `S${Math.ceil(d.getUTCDate()/7)}`;
      if (!weeks[w]) weeks[w]={income:0, expense:0};
      if (t.type==="income") weeks[w].income+=t.amount;
      else weeks[w].expense+=t.amount;
    }
    const weeklyBalance = Object.values(weeks).reduce((s,v)=>s+v.income-v.expense,0);
    expect(weeklyBalance).toBe(expectedTotals.balance);
  });
  it("presupuestos demo: global 1.8M debe detectar overspend correctamente", () => {
    // dataset intencionalmente excede para validar UX rojo (ADR-004)
    const spent = expectedTotals.expense;
    expect(spent).toBeGreaterThan(0);
    // el test valida que el cálculo detecta si excede, no que no exceda
    const pct = Math.round((spent / 1800000) * 100);
    expect(pct).toBeGreaterThan(100); // debe mostrar >100% y rojo
  });
  it("supermercado 14 txs suma excede 350k — UX debe mostrar rojo", () => {
    const spent = dataset100.filter(t=>t.category_slug==="supermercado" && t.type==="expense").reduce((s,t)=>s+t.amount,0);
    expect(spent).toBeGreaterThan(350000); // overspend intencional para validar barra roja
    expect(dataset100.filter(t=>t.category_slug==="supermercado").length).toBe(14);
  });
  it("suscripciones recurrentes detectables: 6 con mismo merchant cada mes", () => {
    const subs = dataset100.filter(t=>t.category_slug==="suscripciones");
    expect(subs.length).toBe(6);
    expect(subs.map(s=>s.merchant)).toContain("Spotify");
  });
  it("pagos con tarjeta crédito existen pero son categoría normal", () => {
    const cc = dataset100.filter(t=>t.payment_method==="credit_card");
    expect(cc.length).toBeGreaterThan(10);
    expect(cc.every(t=> t.account_type==="credit_card")).toBe(true);
  });
});
