import { FastifyInstance } from "fastify";
import { z } from "zod";
import { supabase, getUserId, isMockMode } from "../../lib/supabase.js";
import { parseEmail, normalizeForAI } from "./parser.js";
import { isDuplicate } from "./dedup.js";
import { mockStore } from "../../lib/mockStore.js";
import { allowlistHit } from "./allowlist.js";

function toTitleCase(s: string): string {
  return s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

const EmailIngest = z.object({
  sender: z.string().optional(),
  subject: z.string().optional(),
  raw_content: z.string().min(1).max(20000),
  external_id: z.string().optional(),
  received_at: z.string().optional(),
  source: z.enum(["gmail", "android_notification", "manual"]).optional().default("gmail"),
});

async function findRule(userId: string, merchantNormalized: string) {
  if (isMockMode) return mockStore.findRule(userId, merchantNormalized);
  const { data, error } = await supabase.from("rules").select("id, preferred_category_id, preferred_merchant_alias, hits_count").eq("user_id", userId).eq("merchant_normalized", merchantNormalized).limit(1);
  if (error) throw new Error(`findRule: ${error.message}`);
  return ((data ?? []) as any[])[0] ?? null;
}

async function incrementHits(matchedRule: any) {
  if (isMockMode) return mockStore.incrementRuleHits(matchedRule.id);
  const { error } = await supabase.from("rules").update({ hits_count: (matchedRule.hits_count ?? 0) + 1, updated_at: new Date().toISOString() }).eq("id", matchedRule.id);
  if (error) console.error("incrementHits:", error.message);
}

async function processIngestion(data: any, userId: string) {
  const { sender, subject, raw_content, external_id, received_at, source } = data;
  const p = parseEmail(raw_content);
  const normalized = normalizeForAI(raw_content);
  const senderAllowlisted = allowlistHit(sender);

  // Idempotencia por external_id
  if (external_id) {
    let existingId: string | null = null;
    if (isMockMode) {
      existingId = mockStore.rawEvents?.[`${source}:${external_id}`] ?? null;
    } else {
      const { data: existing, error } = await supabase.from("raw_events").select("id").eq("source", source).eq("external_id", external_id).eq("user_id", userId).limit(1);
      if (error) return { status: 500, body: { error: `raw_events lookup: ${error.message}` } };
      existingId = ((existing ?? []) as any[])[0]?.id ?? null;
    }
    if (existingId) return { status: 200, body: { dedup: true, raw_event_id: existingId, message: "duplicate email ignored", parsed: p, normalized, mocked: isMockMode } };
  }

  // RawEvent inmutable §12 — incluye metadata guard/allowlist para auditoría
  let rawEventId: string;
  let rawEvent: any;
  const rawMetadata: any = { normalized, allowlist_hit: senderAllowlisted, sender };
  if (isMockMode) {
    rawEventId = `mock-${crypto.randomUUID()}`;
    rawEvent = { id: rawEventId, user_id: userId, source, external_id: external_id ?? null, sender: sender ?? null, subject: subject ?? null, received_at: received_at ?? new Date().toISOString(), mocked: true, metadata: rawMetadata };
    mockStore.rawEvents = mockStore.rawEvents ?? {};
    mockStore.rawEvents[`${source}:${external_id}`] = rawEventId;
    (mockStore as any).rawEventsMeta = (mockStore as any).rawEventsMeta ?? {};
    (mockStore as any).rawEventsMeta[rawEventId] = rawMetadata;
    mockStore._persist();
  } else {
    const { data: raw, error } = await supabase.from("raw_events").insert({ user_id: userId, source, external_id: external_id ?? null, sender: sender ?? null, subject: subject ?? null, raw_content, received_at: received_at ?? new Date().toISOString(), metadata: rawMetadata }).select().single();
    if (error) return { status: 500, body: { error: `raw_events insert: ${error.message}` } };
    rawEvent = raw;
    rawEventId = raw.id;
  }

  let finalMerchant = p.merchant ?? (p.operation === "transfer" ? "Transferencia" : "Desconocido");
  let finalCategorySlugOrId: string | null = null;
  let finalCategoryId: string | null = null;
  let aiConfidence = p.confidence;
  let aiNeedsReview = p.confidence < 0.6;
  let classificationSource: string = "parser";
  let matchedRule: any = null;
  let ai: any = null;

  // Step 1: reglas contra merchant del parser (solo si hay monto)
  if (p.amount !== null && p.merchant) {
    matchedRule = await findRule(userId, p.merchant.toLowerCase().trim());
  }

  // Step 2+3: AI guard obligatorio cuando hay monto detectado
  if (p.amount !== null && !matchedRule) {
    try {
      const { createAIProvider } = await import("../../ai/providers/AIProvider.js");
      const provider = createAIProvider(process.env.GROQ_API_KEY ? "groq" : "mock");
      let categories: string[];
      if (isMockMode) {
        categories = ["supermercado", "transporte", "suscripciones", "restaurantes", "servicios", "otros"];
      } else {
        const { data: cats, error } = await supabase.from("categories").select("id, slug").limit(50);
        if (error) return { status: 500, body: { error: `categories: ${error.message}` } };
        categories = (cats ?? []).map((c: any) => c.slug);
      }
      let userRules: { merchant: string; preferred_category: string }[] = [];
      if (isMockMode) {
        userRules = mockStore.listRules(userId).map(r => ({ merchant: r.merchant_normalized, preferred_category: String(r.preferred_category_id) }));
      } else {
        const { data: rules } = await supabase.from("rules").select("merchant_normalized, preferred_category_id").eq("user_id", userId).limit(20);
        userRules = ((rules as any[]) ?? []).map(r => ({ merchant: r.merchant_normalized, preferred_category: String(r.preferred_category_id) }));
      }
      ai = await provider.classify({ normalized_text: normalized, parser_hints: { amount: p.amount, date: p.date ?? undefined, merchant_guess: p.merchant ?? undefined }, categories, user_rules: userRules, locale: "es-CL" });

      // Guard: si IA dice no es transacción, no continuar a insert
      if (ai && ai.is_transaction === false) {
        // Actualizar raw metadata con guard result (best effort)
        if (!isMockMode) {
          await supabase.from("raw_events").update({ metadata: { ...rawMetadata, guard: { is_transaction: false, reason: ai.reason, confidence: ai.confidence } } }).eq("id", rawEventId);
        } else if ((mockStore as any).rawEventsMeta) {
          (mockStore as any).rawEventsMeta[rawEventId] = { ...rawMetadata, guard: { is_transaction: false, reason: ai.reason } };
        }
        return {
          status: 200,
          body: {
            raw_event: rawEvent, parsed: p, normalized, transaction: null, mocked: isMockMode,
            classification_source: "ai_guard",
            ai,
            dedup: { is_duplicate: false },
            ignored_reason: ai.reason ?? "promo_or_informational",
            sender_allowlisted: senderAllowlisted,
            next: `ignored by guard: ${ai.reason}`,
          }
        };
      }

      // Step 3: post-AI rule check (solo si es transacción real)
      if (ai?.merchant && ai.merchant !== "Desconocido") {
        matchedRule = await findRule(userId, ai.merchant.toLowerCase().trim());
      }
    } catch (e: any) {
      console.error("AI classify error:", e?.message ?? e);
      // Sin IA y con monto, no crear gasto fantasma — devolver solo raw_event para retry manual
      return {
        status: 200,
        body: {
          raw_event: rawEvent, parsed: p, normalized, transaction: null, mocked: isMockMode,
          classification_source: "ai_error",
          dedup: { is_duplicate: false },
          warning: `AI unavailable, transaction not created: ${e?.message?.slice(0, 120) ?? e}`,
          sender_allowlisted: senderAllowlisted,
          next: "needs AI retry",
        }
      };
    }
  }

  // Si no hay monto, no hay transacción (sin llamar a IA) — solo raw_event
  if (p.amount === null) {
    return {
      status: 201,
      body: {
        raw_event: rawEvent, parsed: p, normalized, transaction: null, mocked: isMockMode,
        classification_source: "no_amount",
        dedup: { is_duplicate: false },
        sender_allowlisted: senderAllowlisted,
        next: "no amount detected → no transaction — needs manual review",
      }
    };
  }

  if (matchedRule) {
    finalCategorySlugOrId = matchedRule.preferred_category_id;
    finalCategoryId = isMockMode ? matchedRule.preferred_category_id : matchedRule.preferred_category_id;
    aiConfidence = 1.0;
    aiNeedsReview = false;
    classificationSource = "rule";
    await incrementHits(matchedRule);
  } else if (ai) {
    if (ai.merchant) finalMerchant = ai.merchant;
    if (ai.category) finalCategorySlugOrId = ai.category;
    aiConfidence = ai.confidence ?? p.confidence;
    aiNeedsReview = ai.needs_review ?? (p.confidence < 0.6);
    classificationSource = "ai";
  }

  // Normaliza merchant para display
  if (finalMerchant !== "Desconocido" && finalMerchant !== "Transferencia") {
    finalMerchant = toTitleCase(finalMerchant);
  }

  // Resolver category_id en modo real para path AI/parser
  if (!isMockMode && finalCategorySlugOrId && !finalCategoryId) {
    if (/^[0-9a-f-]{36}$/i.test(finalCategorySlugOrId)) {
      finalCategoryId = finalCategorySlugOrId;
    } else {
      const { data: cat } = await supabase.from("categories").select("id").eq("slug", finalCategorySlugOrId).limit(1);
      finalCategoryId = (cat as any[])?.[0]?.id ?? null;
    }
  }

  // Dedup §15 — solo si hay transacción real y monto
  let dedupFound: any = null;
  if (p.amount !== null) {
    const effectiveDate = p.date ?? new Date().toISOString().slice(0, 10);
    const type = (ai?.transaction_type as any) ?? (p.operation === "transfer" ? "transfer" : "expense");
    if (type !== "none") {
      const candidate = { amount: p.amount, date: effectiveDate, time: p.time, merchant: finalMerchant, type };
      let recentTxs: any[];
      if (isMockMode) {
        recentTxs = mockStore.listTransactions(userId);
      } else {
        const { data: recent, error } = await supabase.from("transactions").select("id, amount, date, merchant, type, status").eq("user_id", userId).order("date", { ascending: false }).limit(50);
        if (error) return { status: 500, body: { error: `dedup query: ${error.message}` } };
        recentTxs = (recent as any[]) ?? [];
      }
      dedupFound = isDuplicate(candidate as any, recentTxs);
    }
  }

  // Transaction — solo si guard pasó y hay monto
  let transaction: any = null;
  if (p.amount !== null && !(ai && ai.is_transaction === false)) {
    const type = (ai?.transaction_type as any) ?? (p.operation === "transfer" ? "transfer" : "expense");
    if (type === "none") {
      return {
        status: 200,
        body: { raw_event: rawEvent, parsed: p, normalized, transaction: null, ai, dedup: { is_duplicate: false }, ignored_reason: "guard_none_type", next: "ignored guard none" }
      };
    }
    let status: string, duplicateOf: string | null = null;
    if (dedupFound) { status = "duplicate"; duplicateOf = dedupFound.id; }
    else if (classificationSource === "rule") status = "pending_ai";
    else status = aiNeedsReview ? "pending_review" : "pending_ai";

    const payload: any = {
      user_id: userId, raw_event_id: rawEventId, merchant: finalMerchant,
      amount: p.amount, currency: p.currency ?? "CLP", type,
      category_id: finalCategoryId,
      payment_method: p.last4 ? "credit_card" : "unknown",
      date: p.date ? `${p.date}T${p.time ?? "12:00"}:00Z` : new Date().toISOString(),
      status, confidence: aiConfidence,
      is_recurring_candidate: false, duplicate_of: duplicateOf,
      source: classificationSource,
    };

    if (isMockMode) {
      transaction = mockStore.insertTransaction(userId, payload);
    } else {
      const { data: tx, error } = await supabase.from("transactions").insert(payload).select().single();
      if (error) return { status: 500, body: { error: `transactions insert: ${error.message}`, payload } };
      transaction = tx;
    }
  }

  const isDup = transaction?.status === "duplicate";
  return {
    status: isDup ? 200 : 201,
    body: {
      raw_event: rawEvent, parsed: p, dedup: dedupFound ? { is_duplicate: true, duplicate_of: dedupFound.id, original: dedupFound } : { is_duplicate: false },
      normalized, transaction, mocked: isMockMode,
      classification_source: classificationSource,
      matched_rule: matchedRule ? { id: matchedRule.id, category: matchedRule.preferred_category_id, hits: matchedRule.hits_count } : null,
      ai: ai ?? undefined,
      sender_allowlisted: senderAllowlisted,
      next: isDup ? `duplicate detected → original ${dedupFound.id}` : transaction ? `transaction (${transaction.status}) — ${classificationSource === "rule" ? "Rule (skip AI)" : `AI: ${classificationSource}`}` : "needs manual review",
      warning: isMockMode ? "Modo demo (sin Supabase)." : undefined,
    }
  };
}

export async function ingestionRoutes(app: FastifyInstance) {
  app.post("/v1/ingestion/email", async (req, reply) => {
    const userId = getUserId(req);
    const parsed = EmailIngest.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const result = await processIngestion(parsed.data, userId);
    return reply.status(result.status).send(result.body);
  });
  app.post("/v1/ingestion/notification", async (req, reply) => {
    const userId = getUserId(req);
    const body = { ...(req.body as any), source: "android_notification" };
    const parsed = EmailIngest.safeParse(body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const result = await processIngestion(parsed.data, userId);
    return reply.status(result.status).send(result.body);
  });
  app.get("/v1/raw-events", async (req: any) => {
    const userId = getUserId(req);
    const { data } = await supabase.from("raw_events").select("*").eq("user_id", userId).order("received_at", { ascending: false }).limit(50);
    return data ?? [];
  });
}
