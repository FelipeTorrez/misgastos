/**
 * Seed Phase 2 — inserta dataset100 en Supabase (o mock si no hay credenciales)
 * Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seedPhase2.ts
 * Sin credenciales: solo valida totales y genera preview.
 */
import { dataset100, expectedTotals } from "../../tests/fixtures/dataset100.js";

const DEMO_USER = "00000000-0000-0000-0000-000000000001";
const ACCOUNT_MAP: Record<string, string> = {
  checking: "10000000-0000-0000-0000-000000000001",
  vista: "10000000-0000-0000-0000-000000000002",
  credit_card: "10000000-0000-0000-0000-000000000003",
  cash: "10000000-0000-0000-0000-000000000004",
  digital_wallet: "10000000-0000-0000-0000-000000000005",
};

async function main() {
  console.log("Dataset100 expected:", expectedTotals);
  // Validaciones Phase 2
  if (dataset100.length !== 100) throw new Error(`count ${dataset100.length} != 100`);
  if (expectedTotals.transfer !== 150000) throw new Error("transfer total debe 150k (2 traspasos)");
  if (expectedTotals.balance !== expectedTotals.income - expectedTotals.expense) throw new Error("balance mismatch");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("Sin Supabase creds — validación local OK, preview 5 filas:");
    console.log(dataset100.slice(0,5));
    return;
  }
  const { createClient } = await import("@supabase/supabase-js");
  const sup = createClient(url, key);
  // resolver categorías
  const { data: cats } = await sup.from("categories").select("id, slug").or("is_system.eq.true");
  const catBySlug = new Map((cats ?? []).map((c:any)=>[c.slug, c.id]));
  let ok=0, fail=0;
  for (const f of dataset100) {
    const catId = catBySlug.get(f.category_slug) ?? null;
    const accId = ACCOUNT_MAP[f.account_type];
    const payload:any = {
      user_id: DEMO_USER,
      merchant: f.merchant,
      amount: f.amount,
      currency: "CLP",
      type: f.type,
      category_id: catId,
      account_id: f.type==="transfer" ? null : accId,
      from_account_id: f.type==="transfer" && f.merchant.includes("Vista -> Efectivo") ? ACCOUNT_MAP.vista : f.type==="transfer" ? ACCOUNT_MAP.checking : null,
      to_account_id: f.type==="transfer" && f.merchant.includes("Vista -> Efectivo") ? ACCOUNT_MAP.cash : f.type==="transfer" ? ACCOUNT_MAP.vista : null,
      transfer_group_id: f.type==="transfer" ? crypto.randomUUID() : null,
      payment_method: f.payment_method,
      date: f.date + "T12:00:00Z",
      status: "confirmed",
      confidence: 1
    };
    const { error } = await sup.from("transactions").insert(payload);
    if (error) { console.error("insert fail", f.merchant, error.message); fail++; } else ok++;
  }
  console.log(`Seed done: ${ok} ok, ${fail} fail`);
  const { data: bal } = await sup.rpc("get_balance", { p_user_id: DEMO_USER } as any);
  console.log("balance rpc", bal);
}

main().catch(e=>{ console.error(e); process.exit(1); });
