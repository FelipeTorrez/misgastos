/**
 * Harness de evaluación del clasificador con correcciones reales.
 *
 * Baja GET /v1/transactions (filtra status='corrected' en cliente), cruza por
 * raw_event_id contra GET /v1/raw-events para obtener el texto original, y para
 * cada caso corre el clasificador real (createAIProvider "groq" con GROQ_API_KEY).
 * Compara `ai.category` contra el category_id/slug corregido y reporta accuracy
 * global, matriz de confusión por categoría y lista de fallos (markdown).
 *
 * NO corre en CI (gasta tokens de Groq): se invoca a mano.
 *   npx tsx scripts/eval-classifier.ts --limit 20
 *   npx tsx scripts/eval-classifier.ts --from 2026-01-01 --to 2026-11-01 --limit 50 --out state/eval-clasificador.md
 *   npx tsx scripts/eval-classifier.ts --dry   (sin llamadas a Groq: solo cuenta casos con raw_event encontrado)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAIProvider } from "../src/ai/providers/AIProvider.js";
import { DEFAULT_GROQ_MODEL } from "../src/ai/providers/GroqProvider.js";
import { FINAN_SYSTEM_PROMPT } from "../src/ai/prompts/agente-financiero.js";
import { parseEmail, normalizeForAI } from "../src/modules/ingestion/parser.js";
import { buildEvalUserRules, computeAccuracy, estimateRequestSize, toMarkdown } from "../src/lib/evalClassifier.js";

// Carga backend/.env (lectura simple KEY=VAL, sin dependencias nuevas) para que
// GROQ_API_KEY y GROQ_MODEL estén disponibles al invocar el script a mano sin
// exportar variables. No sobrescribe variables ya presentes en el entorno.
function loadBackendEnv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(here, "../.env"),
  ];
  for (const file of candidates) {
    let raw: string;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      let trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (trimmed.startsWith("export ")) trimmed = trimmed.slice(7).trim();
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        val.length >= 2 &&
        ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      ) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
    return;
  }
}

loadBackendEnv();

type Args = {
  api: string;
  from?: string;
  to?: string;
  limit: number;
  dry: boolean;
  out?: string;
  userId?: string;
  sleep: number;
  verbose: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    api: process.env.API_URL ?? "http://localhost:3000",
    limit: 20,
    dry: false,
    sleep: 12000,
    verbose: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--api" && next) { args.api = next; i++; }
    else if (a === "--from" && next) { args.from = next; i++; }
    else if (a === "--to" && next) { args.to = next; i++; }
    else if (a === "--limit" && next) { args.limit = Math.max(1, parseInt(next, 10) || 20); i++; }
    else if (a === "--dry") { args.dry = true; }
    else if (a === "--out" && next) { args.out = next; i++; }
    else if (a === "--user" && next) { args.userId = next; i++; }
    else if (a === "--sleep" && next) { args.sleep = Math.max(0, parseInt(next, 10) || 0); i++; }
    else if (a === "--verbose") { args.verbose = true; }
    else if (a === "--help" || a === "-h") {
      console.log("Uso: npx tsx scripts/eval-classifier.ts [--api URL] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--limit N] [--dry] [--out path.md] [--user x-user-id] [--sleep MS] [--verbose]");
      process.exit(0);
    }
  }
  return args;
}

async function getJson(url: string, userId?: string): Promise<any> {
  const res = await fetch(url, { headers: userId ? { "x-user-id": userId } : {} });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
  return res.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (process.env.CI === "true" && !args.dry) {
    console.error("eval-classifier: rehúso correr con llamadas reales a Groq en CI (gasta tokens). Usa --dry en CI.");
    process.exit(1);
  }

  const q = new URLSearchParams();
  if (args.from) q.set("from", args.from);
  if (args.to) q.set("to", args.to);
  q.set("limit", "500");
  const qs = q.toString() ? `?${q}` : "";

  const [categories, transactions, rules] = await Promise.all([
    getJson(`${args.api}/v1/categories`, args.userId).catch(() => []),
    getJson(`${args.api}/v1/transactions${qs}`, args.userId).catch((e) => { throw e; }),
    getJson(`${args.api}/v1/rules`, args.userId).catch(() => []),
  ]);

  // Paginar raw-events en bloques de 500 hasta cubrir los raw_event_id
  // pendientes (o agotar; corta si una página vuelve vacía).
  const allTx0: any[] = Array.isArray(transactions) ? transactions : [];
  const pendingRawIds = new Set<string>();
  for (const t of allTx0) {
    if (t?.status === "corrected" && t?.raw_event_id) pendingRawIds.add(String(t.raw_event_id));
  }
  const rawEvents: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await getJson(`${args.api}/v1/raw-events?limit=500&offset=${offset}`, args.userId).catch(() => []);
    const arr = Array.isArray(page) ? page : [];
    if (arr.length === 0) break;
    rawEvents.push(...arr);
    if (pendingRawIds.size > 0 && [...pendingRawIds].every((id) => rawEvents.some((r: any) => String(r?.id) === id))) break;
    if (arr.length < 500) break;
  }

  const idToSlug = new Map<string, string>();
  for (const c of categories ?? []) {
    if (c?.id && c?.slug) idToSlug.set(String(c.id), String(c.slug));
    if (c?.slug) idToSlug.set(String(c.slug), String(c.slug));
  }
  const rawById = new Map<string, any>();
  for (const r of rawEvents ?? []) {
    if (r?.id) rawById.set(String(r.id), r);
  }
  const ruleCatByMerchant = new Map<string, string>();
  for (const r of rules ?? []) {
    const m = (r?.merchant_normalized ?? "").toLowerCase();
    const catId = String(r?.preferred_category_id ?? "");
    if (m) ruleCatByMerchant.set(m, idToSlug.get(catId) ?? catId);
  }

  const allTx = Array.isArray(transactions) ? transactions : [];
  const corrected = allTx.filter((t: any) => t?.status === "corrected");
  const withRaw = [];
  const skippedNoRaw: any[] = [];
  const skippedNoLabel: any[] = [];
  for (const tx of corrected) {
    const raw = tx?.raw_event_id ? rawById.get(String(tx.raw_event_id)) : null;
    if (!raw) { skippedNoRaw.push(tx); continue; }
    const expected = tx?.category_id ? (idToSlug.get(String(tx.category_id)) ?? String(tx.category_id)) : "";
    if (!expected) { skippedNoLabel.push(tx); continue; }
    withRaw.push({ tx, raw, expected });
  }

  const evaluable = withRaw.slice(0, args.limit);

  if (args.dry) {
    const lines = [
      "# Evaluación del clasificador (dry-run, sin llamadas a Groq)",
      "",
      `- Rango: ${args.from ?? "—"} → ${args.to ?? "—"} · API: ${args.api}`,
      `- Transacciones corregidas: **${corrected.length}** (de ${allTx.length} traídas)`,
      `- Con raw_event encontrado (evaluable): **${withRaw.length}** · mostrando hasta limit=${args.limit}: **${evaluable.length}**`,
      `- Sin raw_event (omitidos): **${skippedNoRaw.length}** · sin categoría (omitidos): **${skippedNoLabel.length}**`,
      "",
      "## Casos evaluables (sin clasificar, --dry)",
      "",
      "| ID | Merchant | Monto | Esperada |",
      "| --- | --- | ---: | --- |",
      ...evaluable.map(({ tx, expected }: any) =>
        `| ${tx.id} | ${(tx.merchant ?? "").replace(/\|/g, "\\|")} | ${tx.amount ?? ""} | ${String(expected).toLowerCase()} |`),
      "",
    ];
    emit(lines.join("\n"), args.out);
    return;
  }

  if (!process.env.GROQ_API_KEY) {
    console.error("eval-classifier: falta GROQ_API_KEY (o usa --dry para no llamar a Groq).");
    process.exit(1);
  }

  const provider = createAIProvider("groq");
  const model = process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL;
  const categorySlugs = [...new Set([...idToSlug.values()])].filter((s) => s && s !== "ahorro");
  // Paridad con la ingesta real (ingestion/routes.ts usa `.limit(20)`): el harness
  // pasa solo las primeras 20 reglas como user_rules. Cada regla pesa ~15 tokens;
  // pasarlas todas (~124) suma ~1.900 tokens y empuja a 429 con 8.000 tok/min.
  const userRules = buildEvalUserRules(
    [...ruleCatByMerchant.entries()].map(([merchant, preferred_category]) => ({ merchant, preferred_category })),
  );
  const cases: { id: string; expected: string; predicted: string; merchant?: string; amount?: number; fallback?: boolean }[] = [];
  let fallbackCount = 0;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < evaluable.length; i++) {
    const { tx, raw, expected } = evaluable[i];
    const text: string = raw.raw_content ?? raw.metadata?.normalized ?? "";
    if (!text) { skippedNoRaw.push(tx); continue; }
    const p = parseEmail(text);
    const normalized = normalizeForAI(text);
    const parserHints = { amount: p.amount ?? tx.amount, date: p.date ?? undefined, merchant_guess: p.merchant ?? tx.merchant ?? undefined };
    const categories = categorySlugs.length > 0 ? categorySlugs : ["alimentacion", "transporte", "suscripciones", "restaurantes", "servicios", "otros"];
    if (args.verbose) {
      // Mismo armado que GroqProvider.classify (system + user JSON) para estimar
      // el tamaño del request y diagnosticar 429 sin adivinar.
      const rulesHint = userRules.length
        ? `Reglas usuario (prioridad): ${userRules.map((r) => `${r.merchant}→${r.preferred_category}`).join("; ")}`
        : "Sin reglas";
      const system = FINAN_SYSTEM_PROMPT.replace("[CATEGORIES]", categories.join(", "));
      const userJson = JSON.stringify({ normalized_text: normalized.slice(0, 500), parser_hints: parserHints, categories, rules_hint: rulesHint, locale: "es-CL" });
      const size = estimateRequestSize(system, userJson);
      console.log(`[${i + 1}/${evaluable.length}] id=${tx.id} request≈${size.chars} chars (~${size.approxTokens} tokens) rules=${userRules.length}`);
    }
    const ai = await provider.classify({
      normalized_text: normalized,
      parser_hints: parserHints,
      categories,
      user_rules: userRules,
      locale: "es-CL",
    });
    const isFallback = !!(ai as any)?.provider_fallback;
    if (isFallback) fallbackCount++;
    cases.push({
      id: String(tx.id),
      expected: String(expected),
      predicted: String((ai as any)?.category ?? "otros"),
      merchant: tx.merchant ?? undefined,
      amount: tx.amount ?? undefined,
      fallback: isFallback || undefined,
    });
    if (args.sleep > 0 && i < evaluable.length - 1) await sleep(args.sleep);
  }

  const report = computeAccuracy(cases);
  const header = [
    `# Evaluación del clasificador`,
    ``,
    `- Modelo: **${model}** · reglas usuario: **${userRules.length}**`,
    `- Rango: ${args.from ?? "—"} → ${args.to ?? "—"} · API: ${args.api} · casos: ${cases.length} (evaluables: ${report.total} · no evaluables (fallback Groq): ${report.skippedFallback})`,
    `- Corregidas totales: ${corrected.length} · sin raw_event: ${skippedNoRaw.length} · sin categoría: ${skippedNoLabel.length} · fallback Groq→mock: ${fallbackCount}`,
    ``,
  ].join("\n");
  emit(header + toMarkdown(report, { model, ruleCount: userRules.length }), args.out);
}

function emit(md: string, out?: string) {
  if (!out) {
    console.log(md);
    return;
  }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, md, "utf8");
  console.log(`Reporte escrito en ${out}`);
}

main().catch((e) => { console.error("eval-classifier:", e?.message ?? e); process.exit(1); });
