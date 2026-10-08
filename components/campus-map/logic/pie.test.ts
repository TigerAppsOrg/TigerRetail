import { describe, expect, it } from "vitest";
import type { Dept } from "../types";
import { DEPTS } from "./catalog";
import { DEPT_HOME, pieSlices } from "./pie";

const inSlice = (deg: number, s: { start: number; end: number }) => {
  const span = (s.end - s.start + 360) % 360 || 360;
  return (deg - s.start + 360) % 360 <= span;
};

// every non-empty subset of the departments
const COMBOS: Dept[][] = Array.from({ length: 2 ** DEPTS.length - 1 }, (_, m) => DEPTS.filter((_, i) => ((m + 1) >> i) & 1));

describe("pieSlices", () => {
  it("one department is the whole dot", () => {
    expect(pieSlices(["men's"])).toEqual([{ dept: "men's", start: 0, end: 360 }]);
  });
  it("all three: gray on the left, pink upper right, blue lower right", () => {
    expect(pieSlices([...DEPTS])).toEqual([
      { dept: "women's", start: 330, end: 90 },
      { dept: "men's", start: 90, end: 210 },
      { dept: "misc", start: 210, end: 330 },
    ]);
  });
  it("gray is always the left half next to one colour", () => {
    for (const other of ["women's", "men's"] as const) {
      expect(pieSlices([other, "misc"])).toEqual([
        { dept: other, start: 0, end: 180 },
        { dept: "misc", start: 180, end: 360 },
      ]);
    }
  });
  it("whenever gray is there, its slice is centred on 9 o'clock", () => {
    for (const c of COMBOS.filter((c) => c.includes("misc") && c.length > 1)) {
      const g = pieSlices(c).find((s) => s.dept === "misc")!;
      const span = (g.end - g.start + 360) % 360;
      expect((g.start + span / 2) % 360, c.join("+")).toBe(270);
    }
  });
  it("splits into equal halves or thirds", () => {
    for (const c of COMBOS) {
      for (const s of pieSlices(c)) expect((s.end - s.start + 360) % 360 || 360).toBeCloseTo(360 / c.length);
    }
  });
  it("every department's slice covers its home direction, whatever else the seller has", () => {
    for (const c of COMBOS) {
      for (const s of pieSlices(c)) expect(inSlice(DEPT_HOME[s.dept], s), `${c.join("+")}: ${s.dept}`).toBe(true);
    }
  });
  it("pink + blue with no gray: pink on top, blue below", () => {
    const [w, m] = pieSlices(["women's", "men's"]);
    expect(w).toEqual({ dept: "women's", start: 270, end: 90 });
    expect(m).toEqual({ dept: "men's", start: 90, end: 270 });
  });
  it("order of the input doesn't matter", () => {
    expect(pieSlices(["misc", "women's"])).toEqual(pieSlices(["women's", "misc"]));
  });
});
