import { describe, expect, it } from "vitest";
import type { Building, Filters, Listing, Seller } from "../types";
import { emptyFilters, hasItemFilter, matchesListing } from "./filters";
import { buildSellerPins, sortByDistance } from "./pins";
import { viewMode, HEAT_ABOVE_SCALE, PHOTOS_BELOW_SCALE } from "./viewMode";
import { declutter } from "./declutter";
import { placePopover } from "./popover";
import { haversineMeters, polygonCentroid } from "./geo";

const NOW = new Date("2026-10-07T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const L = (o: Partial<Listing>): Listing => ({
  id: "x",
  sellerId: "s1",
  title: "t",
  price: 10,
  section: "clothing",
  sub: "shoes",
  dept: "women's",
  imageUrl: "",
  postedAt: daysAgo(1),
  ...o,
});
const F = (o: Partial<Filters>): Filters => ({ ...emptyFilters(), ...o });

const B1976: Building = { name: "1976 Hall", college: "Butler College", lon: -74.65561, lat: 40.34454 };
const BFORBES: Building = { name: "Forbes College Main", college: "Forbes College", lon: -74.6612, lat: 40.34217 };
const buildings = new Map([B1976, BFORBES].map((b) => [b.name, b]));

describe("matchesListing", () => {
  it("empty filters match everything", () => {
    expect(matchesListing(L({}), emptyFilters(), NOW)).toBe(true);
  });
  it("section filter", () => {
    expect(matchesListing(L({ section: "dorm", sub: "furniture" }), F({ sections: ["clothing"] }), NOW)).toBe(false);
    expect(matchesListing(L({}), F({ sections: ["clothing"] }), NOW)).toBe(true);
  });
  it("a sub narrows only its own section", () => {
    const f = F({ sections: ["clothing", "dorm"], subs: ["shoes"] });
    expect(matchesListing(L({ sub: "shoes" }), f, NOW)).toBe(true);
    expect(matchesListing(L({ sub: "tops" }), f, NOW)).toBe(false);
    // dorm has no sub picked, so every dorm listing still matches
    expect(matchesListing(L({ section: "dorm", sub: "furniture", dept: "misc" }), f, NOW)).toBe(true);
  });
  it("a sub alone, with no section picked, still filters", () => {
    expect(matchesListing(L({ sub: "tops" }), F({ subs: ["shoes"] }), NOW)).toBe(false);
    expect(matchesListing(L({ section: "dorm", sub: "furniture" }), F({ subs: ["shoes"] }), NOW)).toBe(false);
  });
  it("dept filter", () => {
    expect(matchesListing(L({ dept: "men's" }), F({ depts: ["women's"] }), NOW)).toBe(false);
    expect(matchesListing(L({ dept: "women's" }), F({ depts: ["women's", "unisex"] }), NOW)).toBe(true);
  });
  it("recency is inclusive of the boundary and excludes older", () => {
    expect(matchesListing(L({ postedAt: daysAgo(7) }), F({ recency: "7d" }), NOW)).toBe(true);
    expect(matchesListing(L({ postedAt: daysAgo(7.01) }), F({ recency: "7d" }), NOW)).toBe(false);
    expect(matchesListing(L({ postedAt: daysAgo(300) }), F({ recency: "any" }), NOW)).toBe(true);
  });
  it("hasItemFilter is about what, not where or when", () => {
    expect(hasItemFilter(emptyFilters())).toBe(false);
    expect(hasItemFilter(F({ recency: "7d", colleges: ["Butler College"] }))).toBe(false);
    expect(hasItemFilter(F({ sections: ["dorm"] }))).toBe(true);
    expect(hasItemFilter(F({ subs: ["shoes"] }))).toBe(true);
    expect(hasItemFilter(F({ depts: ["men's"] }))).toBe(true);
  });
});

describe("buildSellerPins", () => {
  const sellers: Seller[] = [
    { id: "a", name: "A", building: "1976 Hall", roomDirections: "" },
    { id: "b", name: "B", building: "1976 Hall", roomDirections: "" },
    { id: "c", name: "C", building: "Forbes College Main", roomDirections: "" },
    { id: "z", name: "Z", building: "Not A Real Hall", roomDirections: "" },
  ];
  const listings = [
    L({ id: "1", sellerId: "a", dept: "men's" }),
    L({ id: "2", sellerId: "a", dept: "men's" }),
    L({ id: "3", sellerId: "a", dept: "women's" }),
    L({ id: "4", sellerId: "b", section: "dorm", sub: "furniture", dept: "misc" }),
    L({ id: "5", sellerId: "c", dept: "unisex" }),
    L({ id: "6", sellerId: "z", dept: "unisex" }),
  ];

  it("one pin per seller with matching listings and the dominant dept", () => {
    const { pins } = buildSellerPins(sellers, listings, buildings, emptyFilters(), NOW);
    const a = pins.find((p) => p.seller.id === "a")!;
    expect(a.listings.map((l) => l.id)).toEqual(["1", "2", "3"]);
    expect(a.dept).toBe("men's");
    expect(pins.map((p) => p.seller.id).sort()).toEqual(["a", "b", "c"]);
  });
  it("reports sellers whose building is not in Princeton's layer instead of dropping them silently", () => {
    const { unresolved } = buildSellerPins(sellers, listings, buildings, emptyFilters(), NOW);
    expect(unresolved.map((s) => s.id)).toEqual(["z"]);
  });
  it("drops sellers with nothing left after filtering, and counts only matches", () => {
    const { pins } = buildSellerPins(sellers, listings, buildings, F({ depts: ["women's"] }), NOW);
    expect(pins.map((p) => p.seller.id)).toEqual(["a"]);
    expect(pins[0].listings).toHaveLength(1);
    expect(pins[0].dept).toBe("women's");
  });
  it("college and building filters apply to where the seller lives", () => {
    expect(
      buildSellerPins(sellers, listings, buildings, F({ colleges: ["Forbes College"] }), NOW).pins.map((p) => p.seller.id),
    ).toEqual(["c"]);
    expect(
      buildSellerPins(sellers, listings, buildings, F({ buildings: ["1976 Hall"] }), NOW).pins.map((p) => p.seller.id).sort(),
    ).toEqual(["a", "b"]);
  });
  it("spreads sellers in the same building apart so their dots don't stack", () => {
    const { pins } = buildSellerPins(sellers, listings, buildings, emptyFilters(), NOW);
    const [a, b] = ["a", "b"].map((id) => pins.find((p) => p.seller.id === id)!);
    const d = haversineMeters(a, b);
    expect(d).toBeGreaterThan(8);
    expect(d).toBeLessThan(40);
    // each stays close to its building
    expect(haversineMeters(a, B1976)).toBeLessThan(20);
    // a lone seller sits on the building itself
    const c = pins.find((p) => p.seller.id === "c")!;
    expect(haversineMeters(c, BFORBES)).toBeLessThan(0.01);
  });
  it("keeps dots apart even when a whole building is selling (move-out week)", () => {
    const crowd: Seller[] = Array.from({ length: 24 }, (_, i) => ({ id: `s${i}`, name: "", building: "1976 Hall", roomDirections: "" }));
    const items = crowd.map((s, i) => L({ id: `l${i}`, sellerId: s.id }));
    const { pins } = buildSellerPins(crowd, items, buildings, emptyFilters(), NOW);
    let min = Infinity;
    for (let i = 0; i < pins.length; i++)
      for (let j = i + 1; j < pins.length; j++) min = Math.min(min, haversineMeters(pins[i], pins[j]));
    expect(min).toBeGreaterThan(10); // ~10 px apart at 1:4000
    expect(Math.max(...pins.map((p) => haversineMeters(p, B1976)))).toBeLessThan(50); // still on the building
  });
  it("sortByDistance orders nearest first", () => {
    const { pins } = buildSellerPins(sellers, listings, buildings, emptyFilters(), NOW);
    const sorted = sortByDistance(pins, BFORBES);
    expect(sorted[0].pin.seller.id).toBe("c");
    expect(sorted[sorted.length - 1].meters).toBeGreaterThan(400);
  });
});

describe("viewMode", () => {
  it("campus scale is always heat, even with a filter", () => {
    expect(viewMode(HEAT_ABOVE_SCALE * 2, true)).toBe("heat");
  });
  it("mid zoom is dots", () => {
    const mid = (HEAT_ABOVE_SCALE + PHOTOS_BELOW_SCALE) / 2;
    expect(viewMode(mid, true)).toBe("dots");
    expect(viewMode(mid, false)).toBe("dots");
  });
  it("close zoom shows photos only when filtering by item", () => {
    expect(viewMode(PHOTOS_BELOW_SCALE / 2, true)).toBe("photos");
    expect(viewMode(PHOTOS_BELOW_SCALE / 2, false)).toBe("dots");
  });
});

describe("declutter", () => {
  const vp = { w: 1000, h: 800 };
  const box = { w: 60, h: 60 };
  it("keeps the higher-priority pin when two overlap", () => {
    const kept = declutter(
      [
        { id: "small", x: 100, y: 100, priority: 1 },
        { id: "big", x: 110, y: 105, priority: 5 },
        { id: "far", x: 400, y: 400, priority: 1 },
      ],
      box,
      vp,
    );
    expect([...kept].sort()).toEqual(["big", "far"]);
  });
  it("drops pins outside the viewport", () => {
    expect(declutter([{ id: "off", x: -200, y: 50, priority: 9 }], box, vp).size).toBe(0);
  });
  it("is deterministic on ties", () => {
    const pts = [
      { id: "b", x: 100, y: 100, priority: 1 },
      { id: "a", x: 105, y: 100, priority: 1 },
    ];
    expect([...declutter(pts, box, vp)]).toEqual(["a"]);
    expect([...declutter([...pts].reverse(), box, vp)]).toEqual(["a"]);
  });
});

describe("placePopover", () => {
  const size = { w: 300, h: 360 };
  const vp = { w: 1200, h: 800 };
  it("opens to the right of the pin when there is room", () => {
    const p = placePopover({ x: 200, y: 400 }, size, vp);
    expect(p.side).toBe("right");
    expect(p.left).toBeGreaterThan(200);
    expect(p.top).toBe(400 - 180);
  });
  it("flips left near the right edge", () => {
    const p = placePopover({ x: 1100, y: 400 }, size, vp);
    expect(p.side).toBe("left");
    expect(p.left + size.w).toBeLessThan(1100);
  });
  it("clamps vertically and keeps the arrow on the pin", () => {
    const p = placePopover({ x: 200, y: 40 }, size, vp);
    expect(p.top).toBeGreaterThanOrEqual(12);
    expect(p.top + p.arrow).toBeCloseTo(40, 0);
  });
  it("becomes a bottom sheet when the screen is too narrow for either side", () => {
    expect(placePopover({ x: 180, y: 300 }, size, { w: 375, h: 812 }).side).toBe("sheet");
  });
});

describe("geo", () => {
  it("centroid of a unit square", () => {
    const c = polygonCentroid([[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]);
    expect(c[0]).toBeCloseTo(1);
    expect(c[1]).toBeCloseTo(1);
  });
  it("centroid is area-weighted, not a vertex average", () => {
    // extra collinear vertices along the bottom edge would bias a naive average
    const c = polygonCentroid([[0, 0], [0.5, 0], [1, 0], [1.5, 0], [2, 0], [2, 2], [0, 2], [0, 0]]);
    expect(c[1]).toBeCloseTo(1);
  });
  it("haversine: 1976 Hall to Forbes is roughly 600 m straight-line", () => {
    const d = haversineMeters(B1976, BFORBES);
    expect(d).toBeGreaterThan(450);
    expect(d).toBeLessThan(650);
  });
});
