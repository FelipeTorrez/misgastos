import { describe, expect, it } from "vitest";
import { arcPath, buildDonutSegments, percentParts } from "./donut";

describe("percentParts", () => {
  it("(a) [1,1,1] suma 100 con enteros", () => {
    const out = percentParts([1, 1, 1]);
    expect(out).toHaveLength(3);
    expect(out.every((n) => Number.isInteger(n))).toBe(true);
    expect(out.reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("buildDonutSegments", () => {
  it("(b) un solo ítem -> 360 grados", () => {
    const segs = buildDonutSegments([{ key: "a", label: "A", value: 100, color: "#fff" }]);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.toDeg - segs[0]!.fromDeg).toBeCloseTo(360, 6);
    expect(segs[0]!.pct).toBe(100);
  });

  it("(c) valores [(0)] -> []", () => {
    expect(buildDonutSegments([{ key: "a", label: "A", value: 0, color: "#fff" }])).toEqual([]);
  });

  it("(d) ignora negativos y NaN", () => {
    const segs = buildDonutSegments([
      { key: "a", label: "A", value: -5, color: "#fff" },
      { key: "b", label: "B", value: NaN, color: "#fff" },
      { key: "c", label: "C", value: 10, color: "#fff" },
    ]);
    expect(segs.map((s) => s.key)).toEqual(["c"]);
  });

  it("(f) con gapDeg>0 los segmentos no se solapan", () => {
    const segs = buildDonutSegments(
      [
        { key: "a", label: "A", value: 50, color: "#111" },
        { key: "b", label: "B", value: 30, color: "#222" },
        { key: "c", label: "C", value: 20, color: "#333" },
      ],
      { gapDeg: 2 }
    );
    expect(segs).toHaveLength(3);
    const sorted = [...segs].sort((a, b) => a.fromDeg - b.fromDeg);
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i]!;
      const next = sorted[(i + 1) % sorted.length]!;
      const nextFrom = i === sorted.length - 1 ? next.fromDeg + 360 : next.fromDeg;
      expect(cur.toDeg).toBeLessThanOrEqual(nextFrom + 1e-9);
      expect(cur.toDeg - cur.fromDeg).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("arcPath", () => {
  it("(e) sin NaN y con r correcto", () => {
    for (const [from, to] of [[0, 90], [0, 360], [10, 350]] as const) {
      const d = arcPath(100, 100, 80, from, to);
      expect(d).not.toMatch(/NaN/);
      expect(d).toContain("80");
      expect(d.startsWith("M ")).toBe(true);
      expect(d).toContain(" A ");
    }
    // círculo completo se parte en dos arcos
    const full = arcPath(100, 100, 80, 0, 360);
    expect((full.match(/ A /g) ?? []).length).toBe(2);
  });
});
