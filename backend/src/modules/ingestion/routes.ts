import { FastifyInstance } from "fastify";
import { z } from "zod";
import { supabase, getUserId, isMockMode } from "../../lib/supabase.js";
import { parseEmail, normalizeForAI } from "./parser.js";
import { enrichPending } from "./pending.js";
import { isDuplicate, betterClassificationPatch, dedupKey } from "./dedup.js";
import { mockStore } from "../../lib/mockStore.js";
import { normalizeMerchant, findBestRuleMatch, isPaymentProcessor } from "../../lib/merchantNorm.js";
import { get as classifyCacheGet, set as classifyCacheSet } from "../../lib/classifyCache.js";
import { allowlistHit } from "./allowlist.js";
import { inferDirection } from "../../ai/prompts/agente-financiero.js";
import { resolveType, resolveStatus } from "./classify.js";
import { chileWallStamp } from "../../lib/dateRange.js";

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

async function findRule(userId: string, merchantRaw: string) {
  const merchantNormalized = normalizeMerchant(merchantRaw);
  if (!merchantNormalized) return null;
  if (isMockMode) {
    return mockStore.findRule(userId, merchantNormalized)
      ?? findBestRuleMatch(merchantNormalized, mockStore.listRules(userId));
  }
  const { data, error } = await supabase.from("rules").select("id, preferred_category_id, preferred_merchant_alias, hits_count").eq("user_id", userId).eq("merchant_normalized", merchantNormalized).limit(1);
  if (error) throw new Error(`findRule: ${error.message}`);
  const exact = ((data ?? []) as any[])[0] ?? null;
  if (exact) return exact;
  // Segundo intento: prefijo/substring (regla >=6 chars, match más largo).
  const { data: all, error: err2 } = await supabase.from("rules").select("id, preferred_category_id, preferred_merchant_alias, hits_count, merchant_normalized").eq("user_id", userId).limit(200);
  if (err2) throw new Error(`findRule: ${err2.message}`);
  return findBestRuleMatch(merchantNormalized, ((all ?? []) as any[]));
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
      existingId = mockStore.findRawEventByExternal(userId, source, external_id ?? null)?.id ?? null;
    } else {
      const { data: existing, error } = await supabase.from("raw_events").select("id").eq("source", source).eq("external_id", external_id).eq("user_id", userId).limit(1);
      if (error) return { status: 500, body: { error: `raw_events lookup: ${error.message}` } };
      existingId = ((existing ?? []) as any[])[0]?.id ?? null;
    }
    if (existingId) return { status: 200, body: { dedup: true, raw_event_id: existingId, message: "duplicate email ignored", parsed: p, normalized, mocked: isMockMode } };
  }

  // RawEvent inmutable §12 — incluye metadata guard/allowlist para auditoría
  let rawEvent: any;
  const rawMetadata: any = { normalized, allowlist_hit: senderAllowlisted, sender };
  if (isMockMode) {
    rawEvent = mockStore.insertRawEvent(userId, { source, external_id: external_id ?? null, sender: sender ?? null, subject: subject ?? null, raw_content, received_at: received_at ?? new Date().toISOString(), metadata: rawMetadata, mocked: true });
  } else {
    const { data: raw, error } = await supabase.from("raw_events").insert({ user_id: userId, source, external_id: external_id ?? null, sender: sender ?? null, subject: subject ?? null, raw_content, received_at: received_at ?? new Date().toISOString(), metadata: rawMetadata }).select().single();
    if (error) return { status: 500, body: { error: `raw_events insert: ${error.message}` } };
    rawEvent = raw;
  }

  return ingestFromRaw(userId, rawEvent);
}

/**
 * Tramo posterior al guardado del raw_event: parser → reglas → IA → dedup →
 * transaction. Reutilizable por POST /v1/raw-events/:id/reprocess sin
 * re-insertar el raw_event ni repetir la idempotencia por external_id.
 */
async function ingestFromRaw(userId: string, rawEvent: any) {
  const rawEventId: string = rawEvent.id;
  const sender: string | null = rawEvent.sender ?? null;
  const rawContent: string = rawEvent.raw_content ?? "";
  const p = parseEmail(rawContent);
  const rawMetadata: any = rawEvent.metadata ?? {};
  const normalized = typeof rawMetadata.normalized === "string" ? rawMetadata.normalized : normalizeForAI(rawContent);
  const senderAllowlisted = typeof rawMetadata.allowlist_hit === "boolean" ? rawMetadata.allowlist_hit : allowlistHit(sender);

  let finalMerchant = p.merchant ?? (p.operation === "transfer" ? "Transferencia" : "Desconocido");
  let finalCategorySlugOrId: string | null = null;
  let finalCategoryId: string | null = null;
  let finalDirection: string | null = null;
  let finalCounterparty: string | null = null;
  let aiConfidence = p.confidence;
  let aiNeedsReview = p.confidence < 0.6;
  let classificationSource: string = "parser";
  let matchedRule: any = null;
  let ai: any = null;
  let aiFromCache = false;

  // Step 1: reglas contra merchant del parser (solo si hay monto)
  if (p.amount !== null && p.merchant) {
    matchedRule = await findRule(userId, p.merchant);
  }

  // Step 2+3: AI guard obligatorio cuando hay monto detectado
  if (p.amount !== null && !matchedRule) {
    // Paso 2a: cache por comercio — si ya se clasificó con alta confianza,
    // reutilizar sin instanciar el provider (ahorra cupo del LLM).
    if (p.merchant) {
      const cached = classifyCacheGet(p.merchant);
      if (cached) {
        aiFromCache = true;
        ai = {
          is_transaction: true,
          transaction_type: cached.direction === "in" ? "income" : cached.direction === "internal" ? "transfer" : "expense",
          direction: cached.direction,
          amount: p.amount,
          currency: p.currency ?? "CLP",
          merchant: cached.merchant,
          counterparty: null,
          category: cached.category,
          date: p.date ?? chileWallStamp().slice(0, 10),
          account_hint: null,
          payment_method: cached.payment_method,
          installment: null,
          is_recurring_candidate: cached.is_recurring_candidate,
          is_transfer_candidate: cached.direction === "internal",
          confidence: cached.confidence,
          needs_review: false,
          reason: "ai_cache: comercio clasificado antes",
        };
      }
    }
    if (!aiFromCache) {
    try {
      const { createAIProvider } = await import("../../ai/providers/AIProvider.js");
      const provider = createAIProvider(process.env.GROQ_API_KEY ? "groq" : "mock");
      let categories: string[];
      if (isMockMode) {
        categories = ["alimentacion", "transporte", "suscripciones", "restaurantes", "servicios", "otros"];
      } else {
        const { data: cats, error } = await supabase.from("categories").select("id, slug").limit(50);
        if (error) return { status: 500, body: { error: `categories: ${error.message}` } };
        categories = ((cats ?? []) as any[]).map((c: any) => c.slug).filter((s: string) => s !== "ahorro");
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
        const guardMetadata = { ...rawMetadata, normalized, allowlist_hit: senderAllowlisted, guard: { is_transaction: false, reason: ai.reason, confidence: ai.confidence } };
        if (!isMockMode) {
          await supabase.from("raw_events").update({ metadata: guardMetadata }).eq("id", rawEventId);
        } else {
          mockStore.updateRawEvent(rawEventId, { metadata: guardMetadata });
        }
        rawEvent.metadata = guardMetadata;
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
        matchedRule = await findRule(userId, ai.merchant);
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
    // Step 3 (cache hit): una regla creada después del cacheo manda igual.
    if (aiFromCache && ai?.merchant && ai.merchant !== "Desconocido") {
      matchedRule = await findRule(userId, ai.merchant);
    }
    // Poblar cache en miss: solo clasificaciones reutilizables de alta
    // confianza, sin fallback y de transacción real. NUNCA amount/date.
    if (!aiFromCache && ai && ai.is_transaction !== false && ai.confidence >= 0.9 && !(ai as any).provider_fallback && ai.merchant && ai.merchant !== "Desconocido") {
      classifyCacheSet(ai.merchant, {
        category: ai.category,
        merchant: ai.merchant,
        payment_method: ai.payment_method,
        direction: ai.direction,
        is_recurring_candidate: ai.is_recurring_candidate ?? false,
        confidence: ai.confidence,
      });
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
    // Si hay regla, inferir dirección desde AI si existe, si no desde texto
    if (ai?.direction) { finalDirection = ai.direction; finalCounterparty = ai.counterparty ?? null; }
    else { finalDirection = inferDirection(normalized); }
    await incrementHits(matchedRule);
  } else if (ai) {
    if (ai.merchant) finalMerchant = ai.merchant;
    if (ai.category) finalCategorySlugOrId = ai.category;
    if (ai.direction) finalDirection = ai.direction;
    if (ai.counterparty) finalCounterparty = ai.counterparty;
    aiConfidence = ai.confidence ?? p.confidence;
    aiNeedsReview = ai.needs_review ?? (p.confidence < 0.6);
    if (aiFromCache) {
      classificationSource = "ai_cache";
    } else {
      classificationSource = (ai as any)?.provider_fallback ? "fallback" : "ai";
      if (classificationSource === "fallback") aiNeedsReview = true;
    }
  }
  // Fallback dirección si aún no seteada y hay monto (parser sin IA o regla sin AI)
  if (!finalDirection && p.amount !== null) {
    finalDirection = inferDirection(normalized);
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

  // Cola de revisión: procesadores de pago. El banco trae al procesador
  // (merpago, payu...), no al comercio real: ninguna IA puede acertar, así
  // que se descarta la categoría inventada y va a pending_review con
  // metadata.review_reason='payment_processor'. Una regla de usuario sí manda
  // (conocimiento explícito, no invento).
  const processorHit =
    classificationSource !== "rule" &&
    (isPaymentProcessor(p.merchant) || isPaymentProcessor(ai?.merchant) || isPaymentProcessor(finalMerchant));
  if (processorHit) {
    finalCategorySlugOrId = null;
    finalCategoryId = null;
  }

  // Dedup §15 — solo si hay transacción real y monto
  let dedupFound: any = null;
  if (p.amount !== null) {
    const effectiveDate = (ai as any)?.date ?? p.date ?? chileWallStamp();
    const type = resolveType({ aiType: ai?.transaction_type ?? null, direction: finalDirection, operation: p.operation });
    if (type !== "none") {
      const candidate = {
        amount: p.amount, date: effectiveDate, time: p.time, merchant: finalMerchant, type,
        category_id: finalCategoryId, source: classificationSource, confidence: aiConfidence,
      };
      let recentTxs: any[];
      if (isMockMode) {
        recentTxs = mockStore.listTransactions(userId);
      } else {
        const { data: recent, error } = await supabase.from("transactions").select("id, amount, date, merchant, type, status, category_id, confidence, source, metadata").eq("user_id", userId).order("date", { ascending: false }).limit(50);
        if (error) return { status: 500, body: { error: `dedup query: ${error.message}` } };
        recentTxs = (recent as any[]) ?? [];
      }
      dedupFound = isDuplicate(candidate as any, recentTxs);
    }
  }

  // Transaction — solo si guard pasó y hay monto
  let transaction: any = null;
  if (p.amount !== null && !(ai && ai.is_transaction === false)) {
    const type = resolveType({ aiType: ai?.transaction_type ?? null, direction: finalDirection, operation: p.operation });
    if (type === "none") {
      return {
        status: 200,
        body: { raw_event: rawEvent, parsed: p, normalized, transaction: null, ai, dedup: { is_duplicate: false }, ignored_reason: "guard_none_type", next: "ignored guard none" }
      };
    }
    // Semántica de status (lo que ve el usuario en los chips de Movimientos):
    // duplicado, procesador de pago (MG-013), IA en fallback (MG-015),
    // needs_review o confianza alta. Precedencia en ./classify.ts (resolveStatus).
    const status = resolveStatus({
      dedupFound,
      processorHit,
      classificationSource,
      aiConfidence,
      aiNeedsReview,
      providerFallback: Boolean((ai as any)?.provider_fallback),
    });
    const duplicateOf: string | null = dedupFound ? dedupFound.id : null;

    // Resolver payment_method desde AI o fallback
    const paymentMethod = (ai?.payment_method as any) ?? (p.last4 ? "credit_card" as const : "unknown" as const);
    const direction = (ai?.direction as any) ?? finalDirection ?? (type === "income" ? "in" : type === "transfer" ? "internal" : "out");
    const fallbackReason = (ai as any)?.provider_fallback as string | undefined;
    const metadata: any = {};
    if (fallbackReason) metadata.review_reason = `ai_fallback:${fallbackReason}`;
    if (processorHit) {
      if (metadata.review_reason) metadata.ai_fallback = fallbackReason;
      metadata.review_reason = "payment_processor";
    }
    // Huella atómica (migración 008). Sólo la fila que aspira a ser el original
    // lleva dedup_key; las 'duplicate' se guardan con null para no competir por
    // el índice único (ver supabase/migrations/008_dedup_key.sql).
    const atomicDedupKey = dedupKey({
      amount: p.amount,
      type,
      merchant: finalMerchant,
      date: (ai as any)?.date ?? p.date ?? null,
      time: p.time,
      receivedAt: rawEvent.received_at ?? null,
    });

    const payload: any = {
      user_id: userId, raw_event_id: rawEventId, merchant: finalMerchant,
      amount: p.amount, currency: p.currency ?? "CLP", type,
      category_id: finalCategoryId,
      direction, counterparty: finalCounterparty ?? ai?.counterparty ?? null,
      payment_method: paymentMethod,
      date: ((ai as any)?.date ?? p.date) ? `${((ai as any)?.date ?? p.date) as string}T${p.time ?? "12:00"}:00Z` : chileWallStamp(),
      status, confidence: aiConfidence,
      is_recurring_candidate: ai?.is_recurring_candidate ?? false, duplicate_of: duplicateOf,
      source: classificationSource,
      dedup_key: dedupFound ? null : atomicDedupKey,
      ...(Object.keys(metadata).length ? { metadata } : {}),
    };

    if (isMockMode) {
      transaction = mockStore.insertTransaction(userId, payload);
    } else {
      const { data: tx, error } = await supabase.from("transactions").insert(payload).select().single();
      if (!error) {
        transaction = tx;
      } else if ((error as any).code === "23505" && atomicDedupKey) {
        // Otra petición en paralelo insertó el mismo pago entre el SELECT de la
        // dedup §15 y este INSERT: el índice único (user_id, dedup_key) la
        // delata. Se relee el original y se guarda esta fila como 'duplicate',
        // igual que hace la dedup en memoria (sin clave, para no volver a chocar).
        const { data: winners, error: lookupError } = await supabase
          .from("transactions")
          .select("*")
          .eq("user_id", userId)
          .eq("dedup_key", atomicDedupKey)
          .limit(1);
        if (lookupError) return { status: 500, body: { error: `dedup_key lookup: ${lookupError.message}` } };
        const original = ((winners ?? []) as any[])[0] ?? null;
        if (!original) return { status: 500, body: { error: `transactions insert: ${error.message} (dedup_key sin fila)` } };
        const { data: dupRow, error: dupError } = await supabase
          .from("transactions")
          .insert({ ...payload, status: "duplicate", duplicate_of: original.id, dedup_key: null })
          .select()
          .single();
        if (dupError) return { status: 500, body: { error: `transactions duplicate insert: ${dupError.message}` } };
        transaction = dupRow;
        dedupFound = original;
      } else {
        return { status: 500, body: { error: `transactions insert: ${error.message}`, payload } };
      }
    }

    // Dedup §15+: no gana la fila que llegó primero, gana la mejor clasificación.
    // El superviviente adopta categoría/merchant/confianza del candidato cuando
    // este es mejor, y deja rastro del id absorbido en metadata.merged_from.
    // Nunca se pisa una corrección manual (status='corrected').
    if (dedupFound && transaction?.id) {
      const mergePatch = betterClassificationPatch(
        { category_id: finalCategoryId, source: classificationSource, confidence: aiConfidence, merchant: finalMerchant },
        dedupFound,
      );
      if (mergePatch) {
        const prevMetadata =
          dedupFound.metadata && typeof dedupFound.metadata === "object" ? dedupFound.metadata : {};
        const mergedFrom: string[] = Array.isArray(prevMetadata.merged_from) ? [...prevMetadata.merged_from] : [];
        if (!mergedFrom.includes(transaction.id)) mergedFrom.push(transaction.id);
        const survivorPatch = { ...mergePatch, metadata: { ...prevMetadata, merged_from: mergedFrom } };
        if (isMockMode) {
          mockStore.updateTransaction(userId, dedupFound.id, survivorPatch);
        } else {
          const { error } = await supabase
            .from("transactions")
            .update({ ...survivorPatch, updated_at: new Date().toISOString() })
            .eq("id", dedupFound.id)
            .eq("user_id", userId);
          if (error) console.error("dedup classification merge:", error.message);
        }
      }
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

/** raw_event_ids ya vinculados a una transacción (para el filtro pending). */
async function linkedRawEventIds(userId: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  try {
    const builder: any = supabase.from("transactions").select("raw_event_id").eq("user_id", userId);
    const res = typeof builder.in === "function" ? await builder.in("raw_event_id", ids) : await builder.limit(500);
    return new Set(((res?.data ?? []) as any[]).map(t => t.raw_event_id).filter(Boolean));
  } catch {
    return new Set();
  }
}

/**
 * Los headers x-pending-* resumen la COLA completa, no la página. Para eso hay
 * que leer todas las filas pendientes (tope de seguridad 2000) y paginar la
 * respuesta después. Ver MG-083/MG-086: con limit=50 los headers publicaban
 * $1,4M mientras la cola completa sumaba $146M con promos ($6,3M reales).
 */
const PENDING_FETCH_MAX = 2000;
const PENDING_FETCH_PAGE = 500;

function listAllPendingMock(userId: string): any[] {
  const all: any[] = [];
  while (all.length < PENDING_FETCH_MAX) {
    const page = mockStore.listRawEvents(userId, { limit: PENDING_FETCH_PAGE, offset: all.length, pending: true });
    all.push(...page);
    if (page.length < PENDING_FETCH_PAGE) break;
  }
  return all.slice(0, PENDING_FETCH_MAX);
}

async function listAllPendingReal(userId: string): Promise<any[]> {
  const pending: any[] = [];
  let offset = 0;
  while (pending.length < PENDING_FETCH_MAX) {
    const builder: any = supabase.from("raw_events").select("*").eq("user_id", userId).order("received_at", { ascending: false });
    const canRange = typeof builder.range === "function";
    const { data } = canRange
      ? await builder.range(offset, offset + PENDING_FETCH_PAGE - 1)
      : await builder.limit(offset + PENDING_FETCH_PAGE);
    const fetched = ((data ?? []) as any[]);
    // Sin .range() (mock de tests): el builder limita a offset+page y aquí se corta la página.
    const rows = canRange ? fetched : fetched.slice(offset, offset + PENDING_FETCH_PAGE);
    if (!rows.length) break;
    const linked = await linkedRawEventIds(userId, rows.map(r => r.id));
    for (const row of rows) {
      if (pending.length >= PENDING_FETCH_MAX) break;
      if (row?.metadata?.guard?.is_transaction !== false && !linked.has(row.id)) pending.push(row);
    }
    if (rows.length < PENDING_FETCH_PAGE) break;
    offset += PENDING_FETCH_PAGE;
  }
  return pending;
}

async function markReprocessed(rawEvent: any, at: string) {
  const metadata = { ...(rawEvent.metadata ?? {}), reprocessed_at: at };
  rawEvent.metadata = metadata;
  if (isMockMode) {
    mockStore.updateRawEvent(rawEvent.id, { metadata });
    return;
  }
  const { error } = await supabase.from("raw_events").update({ metadata }).eq("id", rawEvent.id);
  if (error) console.error("reprocess metadata:", error.message);
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
  app.get("/v1/raw-events", async (req: any, reply: any) => {
    const userId = getUserId(req);
    const q = (req.query ?? {}) as any;
    let limit = Number.parseInt(String(q.limit ?? "50"), 10);
    if (!Number.isFinite(limit)) limit = 50;
    limit = Math.min(500, Math.max(1, Math.floor(limit)));
    let offset = Number.parseInt(String(q.offset ?? "0"), 10);
    if (!Number.isFinite(offset)) offset = 0;
    offset = Math.max(0, Math.floor(offset));
    const pendingOnly = String(q.pending ?? "") === "1" || String(q.pending ?? "").toLowerCase() === "true";
    if (pendingOnly) {
      // El summary se calcula sobre TODA la cola pendiente (metadata.guard es
      // JSONB, así que el filtro se resuelve en memoria). El body lleva solo la
      // página pedida; x-pending-returned deja claro cuántas filas trae.
      const allPending = isMockMode ? listAllPendingMock(userId) : await listAllPendingReal(userId);
      const enriched = enrichPending(allPending);
      const page = enriched.rows.slice(offset, offset + limit);
      reply.header("x-pending-count", String(enriched.summary.count));
      reply.header("x-pending-returned", String(page.length));
      // x-pending-total ya NO suma promos/créditos preaprobados: es la plata
      // real de la cola. La suma con promos queda en x-pending-total-con-promos.
      reply.header("x-pending-total", String(enriched.summary.total_transactions));
      reply.header("x-pending-total-transactions", String(enriched.summary.total_transactions));
      reply.header("x-pending-total-con-promos", String(enriched.summary.total));
      reply.header("x-pending-promos", String(enriched.summary.promos));
      return page;
    }
    if (isMockMode) {
      return mockStore.listRawEvents(userId, { limit, offset });
    }
    const builder: any = supabase.from("raw_events").select("*").eq("user_id", userId).order("received_at", { ascending: false });
    if (typeof builder.range === "function") {
      const { data } = await builder.range(offset, offset + limit - 1);
      return data ?? [];
    }
    const { data } = await builder.limit(offset + limit);
    return ((data ?? []) as any[]).slice(offset, offset + limit);
  });
  app.post("/v1/raw-events/:id/reprocess", async (req: any, reply) => {
    const userId = getUserId(req);
    const id = String(req.params?.id ?? "");
    let rawEvent: any = null;
    let existing: any = null;
    if (isMockMode) {
      rawEvent = mockStore.getRawEvent(id, userId);
      existing = mockStore.listTransactions(userId, { limit: 10000 }).find(t => t.raw_event_id === id) ?? null;
    } else {
      const { data, error } = await supabase.from("raw_events").select("*").eq("id", id).eq("user_id", userId).limit(1);
      if (error) return reply.status(500).send({ error: `raw_events lookup: ${error.message}` });
      rawEvent = ((data ?? []) as any[])[0] ?? null;
      if (rawEvent) {
        const { data: txs } = await supabase.from("transactions").select("*").eq("user_id", userId).eq("raw_event_id", id).limit(1);
        existing = ((txs ?? []) as any[])[0] ?? null;
      }
    }
    if (!rawEvent) return reply.status(404).send({ error: "raw_event not found" });
    if (existing) return reply.status(200).send({ already: true, raw_event_id: id, transaction: existing });
    const result = await ingestFromRaw(userId, rawEvent);
    if (result.status >= 500) return reply.status(result.status).send(result.body);
    const transaction = (result.body as any)?.transaction ?? null;
    const reprocessedAt = new Date().toISOString();
    await markReprocessed(rawEvent, reprocessedAt);
    if (!transaction) {
      // Sigue sin gasto: 422 con la razón para que el cliente pueda mostrarla.
      const reason = (result.body as any)?.next ?? "no transaction created";
      return reply.status(422).send({ ...(result.body as any), raw_event_id: id, reprocessed_at: reprocessedAt, error: reason });
    }
    return reply.status(200).send({ ...(result.body as any), raw_event_id: id, reprocessed_at: reprocessedAt, reprocessed: true });
  });
}
