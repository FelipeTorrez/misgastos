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

  it("una entrada con fallback:true no se devuelve como hit (MISS)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-cache-"));
    const file = path.join(dir, "cache.json");
    const realKey = caseKey("raw-ok", "model-a", "hash1");
    const fbKey = caseKey("raw-fb", "model-a", "hash1");
    fs.writeFileSync(
      file,
      JSON.stringify({
        [realKey]: entry({ predicted: "alimentacion" }),
        [fbKey]: entry({ predicted: "otros", fallback: true }),
      }),
      "utf8",
    );
    // load auto-sanea: solo carga la entrada real
    expect(load(file)).toBe(1);
    expect(get(realKey)?.predicted).toBe("alimentacion");
    expect(get(fbKey)).toBeUndefined();
    expect(stats().hits).toBe(1);
    expect(stats().misses).toBe(1);
    expect(stats().fallbackSkipped).toBe(1);
  });

  it("set no persiste entradas con fallback:true (no quedan en el archivo)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-cache-"));
    const file = path.join(dir, "cache.json");
    const fbKey = caseKey("raw-fb", "model-a", "hash1");
    // Mismo patrón que scripts/eval-classifier.ts: solo cachear si NO es fallback
    const isFallback = true;
    if (!isFallback) set(fbKey, entry({ fallback: true }));
    // Defensa en profundidad: set ignora fallback aunque se llame directo
    set(fbKey, entry({ fallback: true }));
    expect(get(fbKey)).toBeUndefined();
    expect(stats().entries).toBe(0);
    save(file);
    const onDisk = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    expect(fbKey in onDisk).toBe(false);
  });

  it("save auto-sanea archivos ya contaminados y el markdown informa descartadas", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-cache-"));
    const dirty = path.join(dir, "dirty.json");
    const clean = path.join(dir, "clean.json");
    const realKey = caseKey("raw-ok", "model-a", "hash1");
    const fbKey = caseKey("raw-fb", "model-a", "hash1");
    fs.writeFileSync(
      dirty,
      JSON.stringify({
        [realKey]: entry({ predicted: "alimentacion" }),
        [fbKey]: entry({ predicted: "otros", fallback: true }),
      }),
      "utf8",
    );
    expect(load(dirty)).toBe(1);
    save(clean);
    const onDisk = JSON.parse(fs.readFileSync(clean, "utf8")) as Record<string, unknown>;
    expect(fbKey in onDisk).toBe(false);
    expect(realKey in onDisk).toBe(true);
    // Línea tal como la reporta scripts/eval-classifier.ts (cacheSkippedFallback)
    const headerLine = `- Cache: desde cache: **${stats().hits}** · descartadas por fallback (cache): **${stats().fallbackSkipped}**`;
    expect(headerLine).toContain("descartadas por fallback (cache): **1**");
  });
});
