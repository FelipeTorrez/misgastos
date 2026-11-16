/**
 * Agregador puro del harness de evaluación del clasificador.
 * Sin I/O, sin red, sin IA: solo agrega casos { expected, predicted }.
 */

export type EvalCase = {
  id: string;
  /** Slug de categoría corregido a mano (verdad de terreno). */
  expected: string;
  /** `ai.category` devuelto por el clasificador. */
  predicted: string;
  merchant?: string;
  amount?: number;
  /** true si la predicción vino de provider_fallback (no evaluable). */
  fallback?: boolean;
};

/** Regla usuario tal como la recibe el clasificador. */
export type EvalUserRule = { merchant: string; preferred_category: string };

/**
 * Tope de reglas del harness = tope de la ingesta real
 * (`supabase.from("rules").select(...).limit(20)` en ingestion/routes.ts).
 * Paridad con producción + cupo Groq: cada regla pesa ~15 tokens, pasar las
 * 124 reglas agregaría ~1.900 tokens y empuja la llamada a 429 con 8.000 tok/min.
 */
export const EVAL_MAX_USER_RULES = 20;

/** Recorta al tope de ingesta (primeras 20, mismo criterio que producción). */
export function buildEvalUserRules(all: EvalUserRule[]): EvalUserRule[] {
  return all.slice(0, EVAL_MAX_USER_RULES);
}

/**
 * Tamaño aproximado del request al LLM (system prompt + user JSON).
 * Estimación gruesa ≈ 4 chars/token (suficiente para diagnosticar 429 sin adivinar).
 */
export function estimateRequestSize(systemPrompt: string, userJson: string): { chars: number; approxTokens: number } {
  const chars = systemPrompt.length + userJson.length;
  return { chars, approxTokens: Math.ceil(chars / 4) };
}

export type PerCategoryStats = {
  total: number;
  correct: number;
  accuracy: number;
};

export type EvalReport = {
  total: number;
  correct: number;
  incorrect: number;
  /** 0..1 (1 = todo correcto). 0 cuando no hay casos. */
  accuracy: number;
  /** Casos excluidos por provider_fallback (no evaluables). */
  skippedFallback: number;
  /** Clave = expected normalizado. */
  perCategory: Record<string, PerCategoryStats>;
  /** confusion[expected][predicted] = conteo. */
  confusion: Record<string, Record<string, number>>;
  /** Casos donde predicted !== expected (normalizados). */
  failures: EvalCase[];
};

export function normalizeSlug(s: string): string {
  return s.trim().toLowerCase();
}

export function computeAccuracy(cases: EvalCase[]): EvalReport {
  const perCategory: Record<string, PerCategoryStats> = {};
  const confusion: Record<string, Record<string, number>> = {};
  const failures: EvalCase[] = [];
  let correct = 0;
  let skippedFallback = 0;

  for (const c of cases) {
    if (c.fallback) { skippedFallback++; continue; }
    const expected = normalizeSlug(c.expected);
    const predicted = normalizeSlug(c.predicted);
    const hit = expected === predicted;
    if (hit) correct++;
    else failures.push(c);

    const pc = perCategory[expected] ?? { total: 0, correct: 0, accuracy: 0 };
    pc.total += 1;
    if (hit) pc.correct += 1;
    perCategory[expected] = pc;

    confusion[expected] = confusion[expected] ?? {};
    confusion[expected][predicted] = (confusion[expected][predicted] ?? 0) + 1;
  }

  for (const stats of Object.values(perCategory)) {
    stats.accuracy = stats.total > 0 ? stats.correct / stats.total : 0;
  }

  const total = cases.length - skippedFallback;
  return {
    total,
    correct,
    incorrect: total - correct,
    accuracy: total > 0 ? correct / total : 0,
    skippedFallback,
    perCategory,
    confusion,
    failures,
  };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

/** Render markdown del reporte (puro, sin fecha/hora para que sea estable). */
export function toMarkdown(report: EvalReport, opts?: { title?: string; model?: string; ruleCount?: number }): string {
  const title = opts?.title ?? "Evaluación del clasificador";
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  if (opts?.model !== undefined) lines.push(`- Modelo: **${opts.model}**`);
  if (opts?.ruleCount !== undefined) lines.push(`- Reglas usuario: **${opts.ruleCount}**`);
  lines.push(`- Casos: **${report.total}** · aciertos: **${report.correct}** · fallos: **${report.incorrect}**`);
  lines.push(`- Accuracy global: **${pct(report.accuracy)}**`);
  lines.push(`- No evaluables (fallback Groq): **${report.skippedFallback ?? 0}**`);
  lines.push("");
  lines.push("## Por categoría (esperada)");
  lines.push("");
  lines.push("| Categoría | Total | Aciertos | Accuracy |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const cat of Object.keys(report.perCategory).sort()) {
    const s = report.perCategory[cat];
    lines.push(`| ${cat} | ${s.total} | ${s.correct} | ${pct(s.accuracy)} |`);
  }
  if (report.total === 0) lines.push("| (sin casos) | 0 | 0 | — |");
  lines.push("");
  lines.push("## Matriz de confusión (esperada → predicha)");
  lines.push("");
  lines.push("| Esperada \\ Predicha | Predicción | N |");
  lines.push("| --- | --- | ---: |");
  for (const exp of Object.keys(report.confusion).sort()) {
    for (const pred of Object.keys(report.confusion[exp]).sort()) {
      lines.push(`| ${exp} | ${pred} | ${report.confusion[exp][pred]} |`);
    }
  }
  if (report.total === 0) lines.push("| (sin casos) | — | 0 |");
  lines.push("");
  lines.push("## Fallos");
  lines.push("");
  if (report.failures.length === 0) {
    lines.push("Sin fallos 🎉");
  } else {
    lines.push("| ID | Merchant | Monto | Esperada | Predicha |");
    lines.push("| --- | --- | ---: | --- | --- |");
    for (const f of report.failures) {
      const merchant = (f.merchant ?? "").replace(/\|/g, "\\|");
      lines.push(`| ${f.id} | ${merchant} | ${f.amount ?? ""} | ${normalizeSlug(f.expected)} | ${normalizeSlug(f.predicted)} |`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
