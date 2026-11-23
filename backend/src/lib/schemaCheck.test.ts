import { describe, it, expect, vi } from "vitest";
import { checkSchema } from "./schemaCheck.js";

type Reply = { error: any };

/** Stub mínimo del cliente Supabase: sólo `from().select().limit()`. */
function stubClient(handler: (table: string, col: string) => Reply | Promise<Reply>) {
  return {
    from: (table: string) => ({
      select: (col: string) => ({
        limit: async () => handler(table, col),
      }),
    }),
  };
}

const present: Reply = { error: null };

describe("schemaCheck — aviso de columnas faltantes", () => {
  it("todo presente → ok:true, sin missing y sin warnings", async () => {
    const warn = vi.fn();
    const res = await checkSchema(stubClient(() => present), { warn });
    expect(res).toEqual({ ok: true, missing: [] });
    expect(warn).not.toHaveBeenCalled();
  });

  it("42703 (transactions.metadata) → missing sólo esa columna", async () => {
    const res = await checkSchema(
      stubClient((table, col) =>
        table === "transactions" && col === "metadata"
          ? { error: { code: "42703", message: "column transactions.metadata does not exist" } }
          : present
      )
    );
    expect(res.ok).toBe(false);
    expect(res.missing).toEqual(["transactions.metadata"]);
  });

  it("PGRST204 (raw_events.metadata) → missing esa columna", async () => {
    const res = await checkSchema(
      stubClient((table, col) =>
        table === "raw_events" && col === "metadata"
          ? { error: { code: "PGRST204", message: "Could not find the 'metadata' column of 'raw_events' in the schema cache" } }
          : present
      )
    );
    expect(res.ok).toBe(false);
    expect(res.missing).toEqual(["raw_events.metadata"]);
  });

  it("PGRST205 (transactions ausente) → faltan todas sus columnas", async () => {
    const res = await checkSchema(
      stubClient((table) =>
        table === "transactions"
          ? { error: { code: "PGRST205", message: "Could not find the table 'public.transactions' in the schema cache" } }
          : present
      )
    );
    expect(res.ok).toBe(false);
    expect(res.missing).toEqual(["transactions.metadata", "transactions.dedup_key"]);
  });

  it("cliente null → ok:true, missing vacío y warning", async () => {
    const warn = vi.fn();
    const res = await checkSchema(null, { warn });
    expect(res).toEqual({ ok: true, missing: [] });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("error de red/excepción → ok:true, missing vacío y warning", async () => {
    const warn = vi.fn();
    const res = await checkSchema(
      stubClient(() => {
        throw new Error("fetch failed");
      }),
      { warn }
    );
    expect(res).toEqual({ ok: true, missing: [] });
    expect(warn).toHaveBeenCalledTimes(3); // una por columna requerida
  });
});
