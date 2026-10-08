import type { Building, Filters, Listing } from "../types";
import { RECENCY_DAYS, SECTIONS, tidyCollege } from "./catalog";

export const emptyFilters = (): Filters => ({
  sections: [],
  subs: [],
  depts: [],
  colleges: [],
  buildings: [],
  recency: "any",
});

/* "What am I looking for" filters. Only these turn on photo pins: knowing
   *where* or *when* doesn't make a wall of images any more useful. */
export const hasItemFilter = (f: Filters) => f.sections.length > 0 || f.subs.length > 0 || f.depts.length > 0;

const SUBS_OF = new Map(SECTIONS.map(([s, subs]) => [s, new Set(subs)]));

export function matchesListing(l: Listing, f: Filters, now: Date): boolean {
  if (f.sections.length && !f.sections.includes(l.section)) return false;

  if (f.subs.length) {
    // A picked sub narrows its own section; a section with no sub picked stays whole.
    const own = f.subs.filter((s) => SUBS_OF.get(l.section)?.has(s));
    if (own.length ? !own.includes(l.sub) : !f.sections.includes(l.section)) return false;
  }

  if (f.depts.length && !f.depts.includes(l.dept)) return false;

  const days = RECENCY_DAYS[f.recency];
  if (days !== null && now.getTime() - Date.parse(l.postedAt) > days * 86_400_000) return false;

  return true;
}

export function matchesLocation(b: Building, f: Filters): boolean {
  if (f.colleges.length && !f.colleges.includes(tidyCollege(b.college))) return false;
  if (f.buildings.length && !f.buildings.includes(b.name)) return false;
  return true;
}
