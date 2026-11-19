import { describe, expect, it } from "vitest";
import {
  combineShellStatuses,
  shellErrorMessage,
  statusFromHttp,
  statusFromRejection,
} from "./shellStatus";

describe("shellStatus", () => {
  it("200 → ok, sin mensaje de error", () => {
    const s = statusFromHttp(200, { income: 100 });
    expect(s.ok).toBe(true);
    expect(shellErrorMessage(s)).toBeNull();
  });

  it("503 con code db_unavailable → error con ese código", () => {
    const s = statusFromHttp(503, { code: "db_unavailable", message: "db down" });
    expect(s.ok).toBe(false);
    expect(s.code).toBe("db_unavailable");
    expect(shellErrorMessage(s)).toBe("No se pudieron cargar los datos");
  });

  it("503 sin body → error con código http_503", () => {
    const s = statusFromHttp(503);
    expect(s.ok).toBe(false);
    expect(s.code).toBe("http_503");
    expect(shellErrorMessage(s)).not.toBeNull();
  });

  it("fetch rechazado → error network_error", () => {
    const s = statusFromRejection(new TypeError("Network request failed"));
    expect(s.ok).toBe(false);
    expect(s.code).toBe("network_error");
    expect(shellErrorMessage(s)).toBe("No se pudieron cargar los datos");
  });

  it("basta un fallo entre varias cargas para marcar error", () => {
    expect(combineShellStatuses([{ ok: true }, { ok: true }]).ok).toBe(true);
    const combined = combineShellStatuses([
      { ok: true },
      { ok: false, code: "db_unavailable" },
    ]);
    expect(combined.ok).toBe(false);
    expect(combined.code).toBe("db_unavailable");
  });
});
