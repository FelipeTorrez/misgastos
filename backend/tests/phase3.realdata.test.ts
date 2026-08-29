import { describe, it, expect } from "vitest";
import { fixtures } from "../../tests/fixtures/fixtures.js";

// #3 Real Data — sin DB, valida que fixtures cumplen reglas de negocio Phase 1

function calcBalance(txs: typeof fixtures) {
  let income=0, expense=0;
  for (const t of txs) {
    if (t.type==="income") income+=t.amount;
    else if (t.type==="expense") expense+=t.amount;
  }
  return { income, expense, balance: income-expense };
}
function spentByCat(txs: typeof fixtures, cat: string) {
  return txs.filter(t=>t.type==="expense" && t.category===cat).reduce((s,t)=>s+t.amount,0);
}

describe("#3 Real Data — fixtures Phase 2", () => {
  it("fixtures no contienen investment ni transfer", () => {
    expect(fixtures.every(f=> f.merchant !== "investment")).toBe(true);
    expect(fixtures.filter(f=>f.type==="transfer").length).toBe(0); // transfer es manual, no en fixtures auto
  });
  it("balance global realista: income > expense", () => {
    const { income, expense, balance } = calcBalance(fixtures);
    expect(income).toBe(2750000);
    expect(expense).toBeGreaterThan(0);
    expect(balance).toBe(income-expense);
    expect(balance).toBeGreaterThan(2000000);
  });
  it("presupuesto global 800k: spent < total (no excedido)", () => {
    const spent = fixtures.filter(f=>f.type==="expense").reduce((s,f)=>s+f.amount,0);
    expect(spent).toBeLessThan(800000);
  });
  it("presupuesto alimentacion 250k: ejemplo no excedido", () => {
    const spent = spentByCat(fixtures, "alimentacion");
    expect(spent).toBe(78190);
    expect(spent).toBeLessThan(250000);
  });
  it("todos los montos >0 y fechas válidas", () => {
    for (const f of fixtures) {
      expect(f.amount).toBeGreaterThan(0);
      expect(new Date(f.date).toString()).not.toBe("Invalid Date");
    }
  });
  it("circuito §37: texto 'Compra $32.990 en Lider' parsea a 32990 + Lider", () => {
    // simulación parser determinístico §14
    const raw = "Compra por $32.990 en Lider con tarjeta terminada en 1234 - 24/08/2026";
    const amount = Number(raw.match(/\$ ?([\d\.]+)/)?.[1].replace(/\./g,""));
    const merchant = raw.match(/en (\w+)/)?.[1];
    expect(amount).toBe(32990);
    expect(merchant).toBe("Lider");
  });
});
