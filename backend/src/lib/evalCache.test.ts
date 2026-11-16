import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  caseKey,
  get,
  set,
  load,
  save,
  stats,
  clear,
  promptHash,
  type EvalCacheEntry,
} from "./evalCache.js";

const entry = (over: Partial<EvalCacheEntry> = {}): EvalCacheEntry => ({
  predicted: "alimentacion",
  category_expected: "alimentacion",
  ok: true,
  fallback: false,
  model: "model-a",
  promptHash: "hash1",
  ts: 123,
  ...over,
});

beforeEach(() => {
  clear();
});

describe("evalCache — unidad", () => {
  it("roundtrip en directorio temporal (save + load)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-cache-"));
    const file = path.join(dir, "cache.json");
    set(caseKey("raw-1", "model-a", "hash1"), entry());
    save(file);
    clear();
    expect(stats().entries).toBe(0);
    expect(load(file)).toBe(1);
    expect(get(caseKey("raw-1", "model-a", "hash1"))?.predicted).toBe("alimentacion");
  });

  it("la clave cambia si cambia modelo o promptHash", () => {
    const a = caseKey("raw-1", "model-a", "hash1");
    expect(caseKey("raw-1", "model-b", "hash1")).not.toBe(a);
    expect(caseKey("raw-1", "model-a", "hash2")).not.toBe(a);
    expect(caseKey("raw-2", "model-a", "hash1")).not.toBe(a);
    expect(caseKey("raw-1", "model-a", "hash1")).toBe(a);
  });

  it("promptHash cambia si cambia el prompt o el modelo", () => {
    expect(promptHash("prompt-1", "m")).not.toBe(promptHash("prompt-2", "m"));
    expect(promptHash("prompt-1", "m1")).not.toBe(promptHash("prompt-1", "m2"));
    expect(promptHash("prompt-1", "m")).toBe(promptHash("prompt-1", "m"));
  });

  it("un hit evita la llamada al provider (spy)", async () => {
    // Mismo patrón que scripts/eval-classifier.ts: hit → usar cache sin
    // llamar al provider; miss → clasificar y guardar.
    const classify = vi.fn(async () => ({ category: "alimentacion" }));
    const key = caseKey("raw-9", "model-a", "hash1");
    async function classifyWithCache(k: string): Promise<string> {
      const hit = get(k);
      if (hit) return hit.predicted;
      const ai = await classify();
      set(k, entry({ predicted: String((ai as { category: string }).category) }));
      return (ai as { category: string }).category;
    }
    await expect(classifyWithCache(key)).resolves.toBe("alimentacion");
    await expect(classifyWithCache(key)).resolves.toBe("alimentacion");
    expect(classify).toHaveBeenCalledTimes(1);
    expect(stats().hits).toBe(1);
    expect(stats().misses).toBe(1);
  });

  it("load tolera archivo inexistente o corrupto sin lanzar", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-cache-"));
    expect(load(path.join(dir, "no-existe.json"))).toBe(0);
    const bad = path.join(dir, "bad.json");
    fs.writeFileSync(bad, "{no es json", "utf8");
    expect(load(bad)).toBe(0);
    expect(stats().entries).toBe(0);
  });
});
