/* The wireframe's catalog and browse rules (wireframe/index.html), as pure
   functions. Sections live in the map's catalog so both share one list. */
import type { Section } from "@/components/campus-map/types";
import { APPAREL, SECTIONS } from "@/components/campus-map/logic/catalog";

export { APPAREL, SECTIONS };
export const SECTION_NAMES = SECTIONS.map(([s]) => s);
export const subsOf = (section: string) => SECTIONS.find(([s]) => s === section)?.[1] ?? [];
export const isSection = (s: string): s is Section => SECTION_NAMES.includes(s as Section);

export const CONDITIONS = ["new with tags", "like new", "<5 wears", "slightly worn", "well-loved"] as const;
export type Condition = (typeof CONDITIONS)[number];
export const OCCASIONS = ["none", "lawnparties", "formals", "going out", "grad"] as const;
export type Occasion = (typeof OCCASIONS)[number];

/* Listing department. Apparel is women's / men's / unisex; everything else is misc. */
export type ListingDept = "women's" | "men's" | "unisex" | "misc";
export const APPAREL_DEPTS = ["women's", "men's", "unisex"] as const;
/* The shopper's department (category-row pill). "all" is our default; the
   wireframe always had one picked because it knew your gender from onboarding. */
export const SHOP_DEPTS: [string, string][] = [["all", "all"], ["women's", "women"], ["men's", "men"], ["unisex", "unisex"]];
export const shopDeptLabel = (v: string) => SHOP_DEPTS.find(([k]) => k === v)?.[1] ?? "all";

/* wireframe inDept: non-apparel always shows; unisex apparel shows for women and men too */
export function inDept(l: { section: string; dept: string }, dept: string): boolean {
  if (!APPAREL.has(l.section as Section) || dept === "all") return true;
  return dept === "unisex" ? l.dept === "unisex" : l.dept === dept || l.dept === "unisex";
}

/* ---- sizing: clothing has no single size axis ---- */
export const ALPHA_SIZES = ["x-small", "small", "medium", "large", "x-large", "xx-large"];
export const NUM_SIZES = ["00 (w)", "0 (w)", "2 (w)", "4 (w)", "6 (w)", "8 (w)", "10 (w)", "12 (w)", "14 (w)", "16 (w)"];
export const WAISTS = ["24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "36", "38", "40"];
export const LENGTHS = ["26", "28", "30", "32", "34", "36"];
export const FITS = ["skinny", "slim", "straight", "tapered", "bootcut", "flare", "wide-leg", "relaxed", "baggy"];
export const SHOE_SCALES = ["women's", "men's", "unisex"];
export const SHOE_SIZES = ["5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "13"];

export type SizeSystem = "alpha" | "waist" | "shoe" | "one" | "na";
export interface Sizing {
  system: SizeSystem;
  alpha: string;
  waist: string;
  length: string;
  fit: string;
  shoe: string;
  scale: string;
}

const PANTS_RE = /(jean|pant|trouser|chino|cargo|short|legging|sweatpant|denim(?! maxi))/i;
export function defaultSystem(section: string, sub: string, title = ""): SizeSystem {
  if (section === "dorm" || section === "everything else" || section === "school supplies") return "na";
  if (section === "jewelry") return "one";
  if (sub === "shoes") return "shoe";
  if (sub === "bags & accessories") return "one";
  if (sub === "bottoms") return PANTS_RE.test(title) ? "waist" : "alpha";
  return "alpha";
}
export const blankSizing = (system: SizeSystem = "alpha"): Sizing => ({
  system,
  alpha: "medium",
  waist: "28",
  length: "30",
  fit: "straight",
  shoe: "8",
  scale: "women's",
});

const shoeTag = (scale: string) => (scale === "men's" ? "(m)" : scale === "unisex" ? "(u)" : "(w)");

/* the one string shown on cards and the item page */
export function sizeLabel(z: Sizing): string {
  switch (z.system) {
    case "waist":
      return `${z.waist} × ${z.length}${z.fit ? ` · ${z.fit}` : ""}`;
    case "shoe":
      return `${z.shoe} ${shoeTag(z.scale)}`;
    case "one":
      return "one size";
    case "na":
      return "n/a";
    default:
      return z.alpha;
  }
}
/* the value the size filter compares against */
export function sizeFacet(z: Sizing): string {
  if (z.system === "waist") return z.waist;
  if (z.system === "shoe") return `${z.shoe} ${shoeTag(z.scale)}`;
  if (z.system === "alpha") return z.alpha;
  return sizeLabel(z);
}
/* letters and dress numbers first, then waists, then shoe sizes */
export function sizeRank(s: string): number {
  const i = [...ALPHA_SIZES, ...NUM_SIZES, "one size", "n/a"].indexOf(s);
  if (i >= 0) return i;
  const n = parseFloat(s);
  if (isNaN(n)) return 9999;
  if (/\((w|m|u)\)$/.test(s)) return 1000 + n;
  return 500 + n;
}

/* Only the fields a system uses are kept, and each must be a known value. */
export function cleanSizing(raw: unknown, section: string, sub: string): Sizing | null {
  const r = (raw ?? {}) as Partial<Sizing>;
  const allowed: SizeSystem[] =
    sub === "bottoms" ? ["waist", "alpha"] : [defaultSystem(section, sub)];
  const system = allowed.includes(r.system as SizeSystem) ? (r.system as SizeSystem) : null;
  if (!system) return null;
  const z = blankSizing(system);
  const pick = (v: unknown, list: string[]) => (typeof v === "string" && list.includes(v) ? v : null);
  if (system === "alpha") {
    const a = pick(r.alpha, [...ALPHA_SIZES, ...NUM_SIZES]);
    if (!a) return null;
    z.alpha = a;
  } else if (system === "waist") {
    const w = pick(r.waist, WAISTS), l = pick(r.length, LENGTHS), f = pick(r.fit, FITS);
    if (!w || !l || !f) return null;
    Object.assign(z, { waist: w, length: l, fit: f });
  } else if (system === "shoe") {
    const s = pick(r.shoe, SHOE_SIZES), c = pick(r.scale, SHOE_SCALES);
    if (!s || !c) return null;
    Object.assign(z, { shoe: s, scale: c });
  }
  return z;
}

/* ---- payment methods ---- */
export const PAYMENTS = [
  { id: "zelle", label: "zelle", hint: "phone or email", needsHandle: true },
  { id: "venmo", label: "venmo", hint: "@handle", needsHandle: true },
  { id: "cash", label: "cash", hint: "in person — nothing to add", needsHandle: false },
  { id: "apple pay", label: "apple pay", hint: "phone number", needsHandle: true },
  { id: "other", label: "other", hint: "e.g. cashapp $tiger", needsHandle: true },
] as const;
export type PaymentId = (typeof PAYMENTS)[number]["id"];
export interface Payment {
  id: PaymentId;
  handle: string;
}
export const paymentLabel = (p: Payment) => (p.handle ? `${p.id} ${p.handle}` : p.id);

/* ---- browse: filters + sort, same model on home and browse ---- */
export const PRICE_BANDS: [string, string][] = [
  ["u15", "under $15"],
  ["15-30", "$15 – $30"],
  ["30-50", "$30 – $50"],
  ["50+", "$50 and up"],
];
export const inBand = (dollars: number, band: string) =>
  band === "u15" ? dollars < 15 : band === "15-30" ? dollars >= 15 && dollars < 30 : band === "30-50" ? dollars >= 30 && dollars < 50 : dollars >= 50;

export const SORTS: [string, string][] = [
  ["recency", "newest first"],
  ["price-asc", "price: low to high"],
  ["price-desc", "price: high to low"],
];

export const FACETS = ["size", "brand", "price", "condition", "occasion"] as const;
export type Facet = (typeof FACETS)[number];
export type Filters = Record<Facet, string[]> & { sort: string };

export interface Browsable {
  priceCents: number;
  sizeFacet: string;
  brand: string;
  condition: string;
  occasion: string;
  createdAt: string;
}

export function applyFilters<T extends Browsable>(list: T[], f: Filters): T[] {
  let r = list;
  if (f.size.length) r = r.filter((l) => f.size.includes(l.sizeFacet));
  if (f.brand.length) r = r.filter((l) => f.brand.includes(l.brand));
  if (f.price.length) r = r.filter((l) => f.price.some((b) => inBand(l.priceCents / 100, b)));
  if (f.condition.length) r = r.filter((l) => f.condition.includes(l.condition));
  if (f.occasion.length) r = r.filter((l) => f.occasion.includes(l.occasion));
  return r;
}

export function sortList<T extends Browsable>(list: T[], sort: string): T[] {
  const r = [...list];
  if (sort === "price-asc") return r.sort((a, b) => a.priceCents - b.priceCents);
  if (sort === "price-desc") return r.sort((a, b) => b.priceCents - a.priceCents);
  return r.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* The choices each facet offers, from what's actually listed. A facet only
   shows when there's a real choice (or one is already picked). */
export function facetOptions(base: Browsable[], f: Filters): Partial<Record<Facet, string[]>> {
  const uniq = (fn: (l: Browsable) => string) => [...new Set(base.map(fn))].filter(Boolean);
  const useful = (vals: string[], key: Facet) => vals.length > 1 || f[key].length > 0;
  const out: Partial<Record<Facet, string[]>> = {};
  const sizes = uniq((l) => l.sizeFacet).filter((v) => v !== "n/a").sort((a, b) => sizeRank(a) - sizeRank(b));
  if (useful(sizes, "size")) out.size = sizes;
  const brands = uniq((l) => l.brand).sort();
  if (useful(brands, "brand")) out.brand = brands;
  out.price = PRICE_BANDS.map(([k]) => k); // price is always offered
  const conds = CONDITIONS.filter((c) => base.some((l) => l.condition === c));
  if (useful(conds, "condition")) out.condition = conds;
  const occ = uniq((l) => l.occasion).filter((o) => o !== "none").sort();
  if (useful(occ, "occasion")) out.occasion = occ;
  return out;
}

/* URL ⇄ filters. Facets are repeated params (?size=small&size=medium). */
export function filtersFromParams(q: Record<string, string | string[] | undefined>): Filters {
  const list = (k: string) => {
    const v = q[k];
    return (Array.isArray(v) ? v : v ? [v] : []).filter((x) => x && x !== "all");
  };
  const sort = typeof q.sort === "string" && SORTS.some(([k]) => k === q.sort) ? q.sort : "recency";
  return { size: list("size"), brand: list("brand"), price: list("price"), condition: list("condition"), occasion: list("occasion"), sort };
}
export const activeCount = (f: Filters) => FACETS.reduce((n, k) => n + f[k].length, 0);

/* ---- category guess from an item's name (sell flow) ----
   First rule with a matching word wins, so specific phrases ("lab coat",
   "desk lamp", "formal dress") sit above the general words they contain. */
const GUESS: [RegExp, Section, string][] = [
  [/\blab (coat|goggles|gear)\b|\bgoggles\b/, "school supplies", "lab gear"],
  [/\b(moving (bags?|boxes)|storage (bags?|bins?|boxes)|boxes)\b/, "dorm", "essentials"],
  [/\b(lamp|bedding|sheets?|pillows?|comforter|duvet|towels?|caddy|bins?|hangers?|fan|mattress|kettle|hamper)\b/, "dorm", "essentials"],
  [/\b(string lights|lights|posters?|tapestry|mirror|plants?|rug|corkboard|frames?|decor|vase)\b/, "dorm", "decoration"],
  [/\b(organi[sz]er|planner|notebooks?|pens?|binders?|stand|stationery)\b/, "school supplies", "stationery"],
  [/\b(textbook|book|reader|edition)\b/, "school supplies", "textbooks"],
  [/\b(calculator|ti-?84|monitor|laptop|ipad|tablet|headphones|earbuds|speaker|charger|keyboard|mouse)\b/, "school supplies", "electronics"],
  [/\b(lawn ?parties)\b/, "special occasions", "lawnparties"],
  [/\b(grad|graduation|stole)\b/, "special occasions", "grad"],
  [/\b(formal|gown|tux|tuxedo)\b/, "special occasions", "formals"],
  [/\b(going out)\b/, "special occasions", "going out"],
  [/\b(earrings?|hoops|studs)\b/, "jewelry", "earrings"],
  [/\b(necklace|chain|pendant)\b/, "jewelry", "necklaces"],
  [/\b(rings?)\b/, "jewelry", "rings"],
  [/\b(bracelets?|bangles?)\b/, "jewelry", "bracelets"],
  [/\b(shoes|sneakers|boots|heels|loafers|sandals|flats|cleats|slippers|trainers)\b/, "clothing", "shoes"],
  [/\b(jacket|coat|puffer|blazer|parka|vest|fleece|raincoat|peacoat|windbreaker)\b/, "clothing", "outerwear"],
  [/\b(jeans|pants|trousers|shorts|skirt|leggings|sweatpants|cargos?|chinos|joggers)\b/, "clothing", "bottoms"],
  [/\b(dress|sundress|romper|jumpsuit)\b/, "clothing", "dresses/rompers"],
  [/\b(tee|t-shirt|shirt|top|crewneck|sweater|hoodie|sweatshirt|cardigan|blouse|tank|polo|button-(up|down)|knit|jersey)\b/, "clothing", "tops"],
  [/\b(bags?|totes?|backpacks?|purses?|hats?|beanies?|caps?|scarf|scarves|belts?|sunglasses|wallets?)\b/, "clothing", "bags & accessories"],
  [/\b(chair|desk|fridge|table|couch|futon|shelf|shelves|dresser|cart|ottoman|bean ?bag|sofa)\b/, "dorm", "furniture"],
  [/\b(camera|bike|yoga mat|board games?|lock)\b/, "everything else", "everything else"],
];

export function guessCategory(title: string): { section: Section; sub: string; word: string } | null {
  const t = title.toLowerCase();
  for (const [re, section, sub] of GUESS) {
    const m = t.match(re);
    if (m) return { section, sub, word: m[0] };
  }
  return null;
}
