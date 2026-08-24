import { dataset100 } from "./dataset100";
// Demo mode para validar UX sin backend: calcula balance/budgets localmente (Phase 2)
export function demoBalance() {
  let income=0, expense=0;
  for(const t of dataset100){ if(t.type==="income") income+=t.amount; else if(t.type==="expense") expense+=t.amount; }
  return { income, expense, balance: income-expense };
}
export function demoBudgets() {
  const globalSpent = dataset100.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const byCat: Record<string, number> = {};
  for(const t of dataset100) if(t.type==="expense") byCat[t.category_slug]=(byCat[t.category_slug]??0)+t.amount;
  return { globalSpent, byCat };
}
export const demoTransactions = dataset100.slice(0,20).map((t,i)=>({ id:`demo-${i}`, merchant:t.merchant, amount:t.amount, type:t.type, date:t.date+"T12:00:00Z", category_slug:t.category_slug }));
