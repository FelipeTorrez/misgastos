import { describe, it, expect } from "vitest";

// Lógica pura extraída de budgets/routes.ts y balance/routes.ts para test unit sin DB

function calcBudgetSpent(transactions: { amount: number; category_id: string | null; type: string }[], budgetCategoryId: string | null) {
  let spent = 0;
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    if (budgetCategoryId === null) spent += t.amount; // global
    else if (t.category_id === budgetCategoryId) spent += t.amount;
  }
  return spent;
}

function calcBalance(transactions: { amount: number; type: string }[]) {
  let income = 0, expense = 0;
  for (const t of transactions) {
    if (t.type === "income") income += t.amount;
    else if (t.type === "expense") expense += t.amount;
    // transfer excluido (ADR-002)
  }
  return { income, expense, balance: income - expense };
}

function calcWeekly(transactions: { amount: number; type: string; date: string }[]) {
  const weeks: Record<string, { income: number; expense: number }> = {};
  for (const t of transactions) {
    const d = new Date(t.date);
    const w = `S${Math.ceil(d.getUTCDate() / 7)}`; // UTC para evitar desfase zona horaria
    if (!weeks[w]) weeks[w] = { income: 0, expense: 0 };
    if (t.type === "income") weeks[w].income += t.amount;
    else if (t.type === "expense") weeks[w].expense += t.amount;
  }
  return Object.entries(weeks).map(([week, v]) => ({ week, ...v, balance: v.income - v.expense }));
}

const CAT_SUPER = "cat-super";
const CAT_TRANS = "cat-trans";

describe("#1 Unit — presupuestos global + categoría (ADR-004)", () => {
  const txs = [
    { amount: 30000, category_id: CAT_SUPER, type: "expense" },
    { amount: 20000, category_id: CAT_SUPER, type: "expense" },
    { amount: 15000, category_id: CAT_TRANS, type: "expense" },
    { amount: 500000, category_id: null, type: "income" },
    { amount: 100000, category_id: null, type: "transfer" }, // debe ignorarse en spent
  ];
  it("global spent suma todos los expense (sin transfer)", () => expect(calcBudgetSpent(txs, null)).toBe(65000));
  it("supermercado spent solo su categoría", () => expect(calcBudgetSpent(txs, CAT_SUPER)).toBe(50000));
  it("transporte spent", () => expect(calcBudgetSpent(txs, CAT_TRANS)).toBe(15000));
  it("categoría sin gasto = 0", () => expect(calcBudgetSpent(txs, "otra")).toBe(0));
  it("income no cuenta en spent", () => expect(calcBudgetSpent([{ amount: 1000, category_id: CAT_SUPER, type: "income" }], CAT_SUPER)).toBe(0));
});

describe("#1 Unit — balance (ADR-002 transfer excluido)", () => {
  it("250k income - 32k expense = balance 218k", () => {
    const r = calcBalance([{ amount: 250000, type: "income" }, { amount: 32990, type: "expense" }]);
    expect(r).toEqual({ income: 250000, expense: 32990, balance: 217010 });
  });
  it("transfer no afecta balance global", () => {
    const r = calcBalance([
      { amount: 100000, type: "income" },
      { amount: 20000, type: "expense" },
      { amount: 50000, type: "transfer" },
    ]);
    expect(r.balance).toBe(80000);
  });
  it("solo transfer => balance 0", () => expect(calcBalance([{ amount: 999, type: "transfer" }]).balance).toBe(0));
});

describe("#1 Unit — evolución semanal", () => {
  it("agrupa S1-S4 correctamente", () => {
    const txs = [
      { amount: 10000, type: "expense", date: "2026-08-02" }, // S1
      { amount: 20000, type: "expense", date: "2026-08-09" }, // S2
      { amount: 50000, type: "income", date: "2026-08-15" },  // S3
    ];
    const w = calcWeekly(txs);
    expect(w.find(x=>x.week==="S1")?.expense).toBe(10000);
    expect(w.find(x=>x.week==="S2")?.expense).toBe(20000);
    expect(w.find(x=>x.week==="S3")?.income).toBe(50000);
  });
});
