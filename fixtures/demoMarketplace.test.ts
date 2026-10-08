import { describe, expect, it } from "vitest";
import { demoMarketplace } from "./demoMarketplace";
import { SECTIONS } from "@/components/campus-map/logic/catalog";

describe("demoMarketplace", () => {
  it("is deterministic", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    expect(demoMarketplace(now)).toEqual(demoMarketplace(now));
  });
  it("has unique seller and listing ids, and every listing has a seller", () => {
    const { sellers, listings } = demoMarketplace();
    expect(new Set(sellers.map((s) => s.id)).size).toBe(sellers.length);
    expect(new Set(listings.map((l) => l.id)).size).toBe(listings.length);
    const ids = new Set(sellers.map((s) => s.id));
    expect(listings.every((l) => ids.has(l.sellerId))).toBe(true);
  });
  it.each([50, 200, 1000])("makes exactly %i listings with unique ids", (n) => {
    const { sellers, listings } = demoMarketplace(new Date(), n);
    expect(listings).toHaveLength(n);
    expect(new Set(sellers.map((s) => s.id)).size).toBe(sellers.length);
    expect(new Set(listings.map((l) => l.id)).size).toBe(n);
  });
  it("more listings means more sellers, not just bigger ones", () => {
    expect(demoMarketplace(new Date(), 1000).sellers.length).toBeGreaterThan(4 * demoMarketplace(new Date(), 200).sellers.length - 20);
  });
  it("only uses real sections and subs, with titles for each", () => {
    const subs = new Map(SECTIONS);
    for (const l of demoMarketplace().listings) {
      expect(subs.get(l.section)).toContain(l.sub);
      expect(l.title).toBeTruthy();
    }
  });
  it("non-apparel is always misc", () => {
    for (const l of demoMarketplace().listings) {
      if (["dorm", "school supplies", "everything else"].includes(l.section)) expect(l.dept).toBe("misc");
    }
  });
});
