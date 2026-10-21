import type { Dept, Recency, Section } from "../types";

/* Same sections and order as the TigerRetail wireframe (wireframe/index.html),
   which is the source of truth for the catalog. */
export const SECTIONS: [Section, string[]][] = [
  ["clothing", ["tops", "bottoms", "dresses/rompers", "outerwear", "shoes", "bags & accessories"]],
  ["dorm", ["furniture", "decoration", "essentials"]],
  ["special occasions", ["lawnparties", "formals", "going out", "grad"]],
  ["school supplies", ["textbooks", "stationery", "electronics", "lab gear"]],
  ["jewelry", ["earrings", "necklaces", "rings", "bracelets"]],
  ["everything else", ["everything else"]],
];

export const APPAREL = new Set<Section>(["clothing", "special occasions"]);

export const DEPTS: Dept[] = ["women's", "men's", "misc"];

export const DEPT_COLOR: Record<Dept, string> = {
  "women's": "#C2417A",
  "men's": "#2F6DB5",
  misc: "#8A8170",
};

export const RECENCY: [Recency, string][] = [
  ["any", "any time"],
  ["1d", "last 24 hours"],
  ["7d", "last week"],
  ["14d", "last 2 weeks"],
  ["30d", "last month"],
];

export const RECENCY_DAYS: Record<Recency, number | null> = {
  any: null,
  "1d": 1,
  "7d": 7,
  "14d": 14,
  "30d": 30,
};

/* Princeton's layer spells it "Upperclass  Housing" (two spaces). */
export const tidyCollege = (c: string) => c.replace(/\s+/g, " ").trim();
