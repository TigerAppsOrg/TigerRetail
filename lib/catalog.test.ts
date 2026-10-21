import { describe, expect, it } from "vitest";
import {
  applyFilters,
  blankSizing,
  cleanSizing,
  defaultSystem,
  facetOptions,
  filtersFromParams,
  guessCategory,
  inDept,
  sizeFacet,
  sizeLabel,
  sizeRank,
  sortList,
  type Browsable,
  type Filters,
} from "./catalog";

const L = (o: Partial<Browsable>): Browsable => ({
  priceCents: 2000,
  sizeFacet: "medium",
  brand: "levi's",
  condition: "like new",
  occasion: "none",
  createdAt: "2026-10-01T00:00:00Z",
  ...o,
});
const F = (o: Partial<Filters> = {}): Filters => ({ size: [], brand: [], price: [], condition: [], occasion: [], sort: "recency", ...o });

describe("inDept (wireframe rule)", () => {
  it("non-apparel shows in every department", () => expect(inDept({ section: "dorm", dept: "misc" }, "men's")).toBe(true));
  it("unisex apparel shows for women and men", () => {
    expect(inDept({ section: "clothing", dept: "unisex" }, "women's")).toBe(true);
    expect(inDept({ section: "clothing", dept: "unisex" }, "men's")).toBe(true);
  });
  it("the unisex department shows only unisex apparel", () => expect(inDept({ section: "clothing", dept: "women's" }, "unisex")).toBe(false));
  it("men's hides women's apparel", () => expect(inDept({ section: "special occasions", dept: "women's" }, "men's")).toBe(false));
  it("all shows everything", () => expect(inDept({ section: "clothing", dept: "men's" }, "all")).toBe(true));
});

describe("sizing", () => {
  it.each([
    ["dorm", "furniture", "", "na"],
    ["jewelry", "rings", "", "one"],
    ["clothing", "shoes", "", "shoe"],
    ["clothing", "bags & accessories", "", "one"],
    ["clothing", "bottoms", "levi's 501 jeans", "waist"],
    ["clothing", "bottoms", "denim maxi skirt", "alpha"],
    ["clothing", "tops", "", "alpha"],
  ])("%s/%s %s → %s", (sec, sub, title, sys) => expect(defaultSystem(sec, sub, title)).toBe(sys));

  it("labels and facets per system", () => {
    const waist = { ...blankSizing("waist"), waist: "28", length: "30", fit: "straight" };
    expect(sizeLabel(waist)).toBe("28 × 30 · straight");
    expect(sizeFacet(waist)).toBe("28");
    const shoe = { ...blankSizing("shoe"), shoe: "9.5", scale: "men's" };
    expect(sizeLabel(shoe)).toBe("9.5 (m)");
    expect(sizeFacet(shoe)).toBe("9.5 (m)");
    expect(sizeLabel(blankSizing("one"))).toBe("one size");
  });

  it("ranks letters, then waists, then shoes", () => {
    const sorted = ["9 (w)", "28", "large", "small"].sort((a, b) => sizeRank(a) - sizeRank(b));
    expect(sorted).toEqual(["small", "large", "28", "9 (w)"]);
  });

  it("cleanSizing accepts the system the subcategory allows", () => {
    expect(cleanSizing({ system: "waist", waist: "30", length: "32", fit: "baggy" }, "clothing", "bottoms")).toMatchObject({ system: "waist", waist: "30" });
    expect(cleanSizing({ system: "alpha", alpha: "small" }, "clothing", "bottoms")).toMatchObject({ system: "alpha", alpha: "small" });
    expect(cleanSizing({ system: "na" }, "dorm", "furniture")).toMatchObject({ system: "na" });
  });
  it("cleanSizing rejects a wrong system or an unknown value", () => {
    expect(cleanSizing({ system: "shoe", shoe: "9", scale: "men's" }, "clothing", "tops")).toBeNull();
    expect(cleanSizing({ system: "alpha", alpha: "huge" }, "clothing", "tops")).toBeNull();
    expect(cleanSizing({ system: "waist", waist: "28" }, "clothing", "bottoms")).toBeNull();
  });
});

describe("filters + sort", () => {
  const list = [
    L({ priceCents: 1000, sizeFacet: "small", brand: "aritzia", createdAt: "2026-10-03T00:00:00Z" }),
    L({ priceCents: 3500, sizeFacet: "28", brand: "levi's", condition: "new with tags", createdAt: "2026-10-01T00:00:00Z" }),
    L({ priceCents: 6000, sizeFacet: "medium", brand: "levi's", occasion: "formals", createdAt: "2026-10-02T00:00:00Z" }),
  ];
  it("each facet narrows, values within a facet OR together", () => {
    expect(applyFilters(list, F({ brand: ["levi's"] }))).toHaveLength(2);
    expect(applyFilters(list, F({ size: ["small", "28"] }))).toHaveLength(2);
    expect(applyFilters(list, F({ price: ["u15", "50+"] })).map((l) => l.priceCents)).toEqual([1000, 6000]);
    expect(applyFilters(list, F({ brand: ["levi's"], occasion: ["formals"] }))).toHaveLength(1);
  });
  it("sorts newest first by default, or by price", () => {
    expect(sortList(list, "recency").map((l) => l.priceCents)).toEqual([1000, 6000, 3500]);
    expect(sortList(list, "price-asc").map((l) => l.priceCents)).toEqual([1000, 3500, 6000]);
    expect(sortList(list, "price-desc").map((l) => l.priceCents)).toEqual([6000, 3500, 1000]);
  });
  it("only offers a facet when there's a choice", () => {
    const opts = facetOptions([L({ brand: "x" }), L({ brand: "x", sizeFacet: "small" })], F());
    expect(opts.brand).toBeUndefined();
    expect(opts.size).toEqual(["small", "medium"]);
    expect(opts.price).toHaveLength(4);
    expect(opts.condition).toBeUndefined();
  });
  it("keeps a facet that's already picked even with one value", () => {
    expect(facetOptions([L({ brand: "x" })], F({ brand: ["x"] })).brand).toEqual(["x"]);
  });
  it("reads filters from the URL, ignoring junk sorts", () => {
    expect(filtersFromParams({ size: ["small", "medium"], brand: "levi's", sort: "bogus" })).toEqual(
      F({ size: ["small", "medium"], brand: ["levi's"] }),
    );
  });
});

describe("guessCategory", () => {
  // the wireframe's own demo items, where the right answer is known
  it.each([
    ["vintage crewneck", "clothing", "tops"],
    ["reunions blazer", "clothing", "outerwear"],
    ["lawnparties sundress", "special occasions", "lawnparties"],
    ["desk lamp", "dorm", "essentials"],
    ["shower caddy", "dorm", "essentials"],
    ["mini fridge", "dorm", "furniture"],
    ["grad stole", "special occasions", "grad"],
    ["formal heels", "special occasions", "formals"],
    ["storage bins (set of 3)", "dorm", "essentials"],
    ["princeton tiger tee", "clothing", "tops"],
    ["rolling cart", "dorm", "furniture"],
    ["going out top", "special occasions", "going out"],
    ["denim maxi skirt", "clothing", "bottoms"],
    ["black formal dress", "special occasions", "formals"],
    ["puffer jacket", "clothing", "outerwear"],
    ["gold hoops", "jewelry", "earrings"],
    ["corkboard + pins", "dorm", "decoration"],
    ["twin xl bedding set", "dorm", "essentials"],
    ["floor mirror", "dorm", "decoration"],
    ["white sneakers", "clothing", "shoes"],
    ["grad photoshoot dress", "special occasions", "grad"],
    ["desk chair", "dorm", "furniture"],
    ["knit cardigan", "clothing", "tops"],
    ["tote bag", "clothing", "bags & accessories"],
    ["string lights", "dorm", "decoration"],
    ["textbook stand", "school supplies", "stationery"],
    ["film camera", "everything else", "everything else"],
    ["levi's 501 straight jeans", "clothing", "bottoms"],
    ["black wide-leg trousers", "clothing", "bottoms"],
    ["corduroy cargo pants", "clothing", "bottoms"],
    ["running shoes", "clothing", "shoes"],
    ["leather loafers", "clothing", "shoes"],
    ["econ 100 textbook", "school supplies", "textbooks"],
    ["ti-84 plus calculator", "school supplies", "electronics"],
    ["lab goggles + coat", "school supplies", "lab gear"],
    ["desk organiser set", "school supplies", "stationery"],
    ["gold chain necklace", "jewelry", "necklaces"],
    ["stacking rings set", "jewelry", "rings"],
    ["pearl bracelet", "jewelry", "bracelets"],
  ])("%s → %s / %s", (title, section, sub) => {
    expect(guessCategory(title)).toMatchObject({ section, sub });
  });
  it("names the word it went on", () => expect(guessCategory("Levi's 501 Jeans")?.word).toBe("jeans"));
  it("returns null when nothing matches", () => expect(guessCategory("mystery item")).toBeNull());
});
