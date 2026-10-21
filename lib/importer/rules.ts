/* Listserv import rules, pure: which emails and links count, how what Claude
   read off a slide becomes a listing draft. No I/O, so every rule is tested. */
import type { Section } from "@/components/campus-map/types";
import {
  ALPHA_SIZES,
  APPAREL,
  PAYMENTS,
  SHOE_SIZES,
  blankSizing,
  defaultSystem,
  guessCategory,
  isSection,
  sizeFacet,
  sizeLabel,
  subsOf,
  type ListingDept,
  type Payment,
  type Sizing,
} from "../catalog";

/* imported listings belong to this account until the seller claims them */
export const IMPORT_ACCOUNT = "listserv";

/* ---- finding decks ---- */

/* Google Slides presentation ids in a list of links, in order, without repeats.
   Handles /presentation/d/<id>/edit, /u/0/d/<id>, and ?id= forms. */
export function deckIdsIn(links: string[]): string[] {
  const ids: string[] = [];
  for (const raw of links) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    if (u.hostname !== "docs.google.com" || !u.pathname.startsWith("/presentation")) continue;
    const m = u.pathname.match(/\/d\/(?:e\/)?([A-Za-z0-9_-]{20,})/) ?? [null, u.searchParams.get("id")];
    const id = m[1];
    if (id && /^[A-Za-z0-9_-]{20,}$/.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
/* URLs written as plain text in an email body. InboxEngine's links list only
   has real <a> links, and people often paste the Slides link as bare text. */
export function linksIn(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const m of (text ?? "").matchAll(/https?:\/\/[^\s<>"'()\[\]]+/g)) {
    const url = m[0].replace(/[.,;:!?]+$/, "");
    if (!out.includes(url)) out.push(url);
  }
  return out;
}
export const deckUrl = (id: string) => `https://docs.google.com/presentation/d/${id}/edit`;
export const deckExportUrl = (id: string, fmt: "pdf" | "pptx") => `https://docs.google.com/presentation/d/${id}/export/${fmt}`;

/* InboxEngine search for sale emails (websearch syntax: OR between terms). */
export const SALE_QUERY = 'sale OR selling OR "senior sale" OR "junior sale" OR "moving sale" OR "closet sale"';

/* Who posted the sale, or nobody we can name. HoagieMail digests repeat other
   people's sales under "Hoagie Mail" with no address: that's a relay, not the seller. */
export function saleAuthor(name: string | null | undefined, email: string | null | undefined): { name: string | null; email: string | null } {
  const n = (name ?? "").trim();
  const e = (email ?? "").trim().toLowerCase();
  if (!e && (/^hoagie\s*mail$/i.test(n) || !n)) return { name: null, email: null };
  return { name: n || null, email: e || null };
}

/* A HoagieMail digest relays many people's posts, each ending in
   "Contact: Name (email)" (or "From:"), between rules of dashes. The entry that
   links this deck says who posted it. null if the deck isn't in the digest. */
export function digestContact(body: string, deckId: string): { name: string | null; email: string | null; text: string } | null {
  const entry = body.split(/\n-{10,}\n/).find((e) => e.includes(deckId));
  if (!entry) return null;
  const m = entry.match(/^(?:Contact|From):\s*(.+?)\s*\(([^()\s]+@[^()\s]+)\)\s*$/m);
  return { name: m ? m[1] : null, email: m ? m[2].toLowerCase() : null, text: entry.trim().slice(0, 4000) };
}

/* ---- sales written in the email itself ---- */

const PRICE_RE = /\$\s?\d|\b\d+\s?(dollars|bucks|obo)\b/i;
const MAX_EMAIL_PHOTOS = 10;

/* Is this email worth a read for items sold in its body? Only a person's own
   post (not a digest), with no slides (the deck path reads those), a price,
   and photos: text-only posts are skipped, like slides without photos. */
export function bodySaleCandidate(m: {
  senderEmail: string | null | undefined;
  body: string | null | undefined;
  links: string[] | null | undefined;
  media: { kind: string; url: string }[] | null | undefined;
}): { ok: true; photos: string[] } | { ok: false; reason: "digest" | "has slides" | "no price" | "no photo" } {
  const body = m.body ?? "";
  if (!(m.senderEmail ?? "").trim()) return { ok: false, reason: "digest" };
  if (deckIdsIn([...(m.links ?? []), ...linksIn(body)]).length) return { ok: false, reason: "has slides" };
  if (!PRICE_RE.test(body)) return { ok: false, reason: "no price" };
  const photos = [...new Set((m.media ?? []).filter((x) => x.kind === "image").map((x) => x.url))].slice(0, MAX_EMAIL_PHOTOS);
  if (!photos.length) return { ok: false, reason: "no photo" };
  return { ok: true, photos };
}

/* Photo links come from whoever wrote the email, so the server only fetches
   public https hosts: no localhost, IP literals or internal names. */
export function fetchablePhotoUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  const h = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || !h.includes(".") || h.startsWith("[")) return false;
  if (/^\d+(\.\d+){3}$/.test(h)) return false;
  return !/(^|\.)(localhost|internal|local)$/.test(h);
}

/* netid from a princeton.edu address: "jmorgan@princeton.edu" → "jmorgan" */
export function netidFromEmail(email: string | null | undefined): string | null {
  const m = (email ?? "").trim().toLowerCase().match(/^([a-z0-9_-]+)@princeton\.edu$/);
  return m ? m[1] : null;
}

/* ---- privacy ---- */

/* Phone numbers in slide text are never republished: "text 609-555-0188",
   "(609) 555 0101", "2296300360" all come out. */
export function stripPhones(text: string): string {
  return text
    // the number, and a cue word right before it ("text", "call me at")
    .replace(/(\b(text|call|txt|cell|phone|number)(\s+me)?(\s+at)?\s*[:#-]?\s*)?(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;!])/g, "$1")
    .trim();
}

/* ---- sizes as people write them on slides ---- */

const ALPHA_ALIASES: Record<string, string> = {
  xxs: "x-small",
  xs: "x-small",
  "x-small": "x-small",
  "extra small": "x-small",
  s: "small",
  small: "small",
  m: "medium",
  med: "medium",
  medium: "medium",
  l: "large",
  large: "large",
  xl: "x-large",
  "x-large": "x-large",
  "extra large": "x-large",
  xxl: "xx-large",
  "xx-large": "xx-large",
};

export interface SizeResult {
  sizing: Sizing;
  size: string; // what the card shows
  sizeFacet: string; // what the size filter matches
}

const DRESS = "(00|0|2|4|6|8|10|12|14|16)";
const inRange = (n: string, lo: number, hi: number) => +n >= lo && +n <= hi;

/* "xs-s", "M", "28x30", "w28 l30", "26", "size 6", "0/2", "8.5", "one size",
   "fits like xs", "" → sizing. Anything we can't read keeps its own words as
   the label rather than a guess. */
export function parseSizeText(raw: string | null | undefined, section: string, sub: string, dept: ListingDept): SizeResult {
  const fitsLike = (raw ?? "").trim().toLowerCase().match(/^fits like\s+(?:an?\s+)?(.+)$/);
  if (fitsLike) {
    const inner = parseSizeText(fitsLike[1], section, sub, dept);
    if (inner.sizeFacet !== "n/a") return { ...inner, size: `fits like ${inner.size}` };
  }
  const system = defaultSystem(section, sub);
  const fixed = (sys: "na" | "one") => {
    const z = blankSizing(sys);
    return { sizing: z, size: sizeLabel(z), sizeFacet: sizeFacet(z) };
  };
  const t = (raw ?? "").trim().toLowerCase().replace(/^size\s*/, "").replace(/[–—]/g, "-");
  if (!t || /^(n\/?a|none|-)$/.test(t)) return fixed(system === "one" ? "one" : "na");
  if (/^(one size|os|o\/s|one-size|free size)$/.test(t)) return fixed("one");

  // waist × length: 28x30, 28 x 30, w28 l30, 28/30 (not "10/12", a dress range)
  const wl = t.match(/^w?\s*(\d{2})\s*(?:x|×|\/|\s+l?)\s*l?\s*(\d{2})$/);
  if (wl && inRange(wl[1], 22, 44) && inRange(wl[2], 24, 38)) {
    const z: Sizing = { ...blankSizing("waist"), waist: wl[1], length: wl[2], fit: "" };
    return { sizing: z, size: `${wl[1]} × ${wl[2]}`, sizeFacet: wl[1] };
  }

  // a waist alone on pants: "26", "w30"
  const w = t.match(/^w?\s*(\d{2})$/);
  if (w && sub === "bottoms" && inRange(w[1], 22, 44)) {
    const z: Sizing = { ...blankSizing("waist"), waist: w[1], length: "", fit: "" };
    return { sizing: z, size: `${w[1]} waist`, sizeFacet: w[1] };
  }

  // shoes: 8, 8.5, "8.5 w", "10 mens"
  if (sub === "shoes") {
    const s = t.match(/^(\d{1,2}(?:\.5)?)\s*(w|women'?s|m|men'?s|u)?$/);
    if (s && SHOE_SIZES.includes(s[1])) {
      const scale = s[2]?.startsWith("m") ? "men's" : s[2]?.startsWith("w") ? "women's" : dept === "men's" ? "men's" : "women's";
      const z: Sizing = { ...blankSizing("shoe"), shoe: s[1], scale };
      return { sizing: z, size: sizeLabel(z), sizeFacet: sizeFacet(z) };
    }
  }

  // letters, including ranges like "xs-s" (the filter matches the first)
  const parts = t.split(/\s*(?:-|\/|to)\s*/).map((p) => ALPHA_ALIASES[p.trim()]);
  if (parts.length && parts.every(Boolean)) {
    const z: Sizing = { ...blankSizing("alpha"), alpha: parts[0]! };
    const label = parts.length > 1 ? `${parts[0]}–${parts[parts.length - 1]}` : parts[0]!;
    return { sizing: z, size: label, sizeFacet: parts[0]! };
  }

  // women's dress numbers: "6", "size 0", and ranges like "0/2" (the filter matches the first)
  const num = sub === "shoes" ? null : t.match(new RegExp(`^${DRESS}(?:\\s*(?:-|/|to)\\s*${DRESS})?$`));
  if (num) {
    const alpha = `${num[1]} (w)`;
    const z: Sizing = { ...blankSizing("alpha"), alpha };
    return { sizing: z, size: num[2] ? `${num[1]}/${num[2]} (w)` : alpha, sizeFacet: alpha };
  }

  // can't read it: keep their words, filter can't match it
  const words = t.slice(0, 30);
  return { sizing: { ...blankSizing("na") }, size: words, sizeFacet: "n/a" };
}

/* ---- what Claude extracts from a slide ---- */

export const IMPORT_CONDITIONS = ["new with tags", "like new", "<5 wears", "slightly worn", "well-loved", "not stated"] as const;

export interface ExtractedItem {
  slide: number;
  title: string;
  price_dollars: number | null;
  size: string | null;
  section: string | null;
  sub: string | null;
  dept: string | null;
  condition: string;
  sold: boolean;
  description: string;
  brand: string | null;
}
export interface ExtractedDeck {
  items: ExtractedItem[];
  payments: { method: string; handle: string | null }[];
  contact: ExtractedContact;
  seller_notes: string[];
}

export interface ImportDraft {
  slide: number;
  title: string;
  priceCents: number;
  section: Section;
  sub: string;
  dept: ListingDept;
  condition: (typeof IMPORT_CONDITIONS)[number];
  description: string;
  brand: string;
  size: SizeResult;
}

/* An extracted item becomes a draft, or is skipped with a reason. Sold items,
   items with no name or no price, are skipped. Category falls back to a guess
   from the title, then "everything else". */
export function toDraft(it: ExtractedItem): { ok: true; draft: ImportDraft } | { ok: false; reason: string } {
  if (it.sold) return { ok: false, reason: "marked sold" };
  const title = stripPhones(it.title ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!title) return { ok: false, reason: "no name" };
  if (it.price_dollars === null || !(it.price_dollars > 0) || it.price_dollars > 10_000) return { ok: false, reason: "no price" };

  let section: Section;
  let sub: string;
  if (it.section && isSection(it.section) && it.sub && subsOf(it.section).includes(it.sub)) {
    section = it.section;
    sub = it.sub;
  } else {
    const g = guessCategory(title);
    section = g?.section ?? "everything else";
    sub = g?.sub ?? "everything else";
  }
  const apparel = APPAREL.has(section);
  const dept: ListingDept = !apparel ? "misc" : it.dept === "women's" || it.dept === "men's" ? it.dept : "unisex";
  const condition = (IMPORT_CONDITIONS as readonly string[]).includes(it.condition) ? (it.condition as ImportDraft["condition"]) : "not stated";
  return {
    ok: true,
    draft: {
      slide: it.slide,
      title,
      priceCents: Math.round(it.price_dollars * 100),
      section,
      sub,
      dept,
      condition,
      description: stripPhones(it.description ?? "").slice(0, 600),
      // lowercase, like the brands people type when they sell ("urban outfitters")
      brand: (it.brand ?? "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 60),
      size: parseSizeText(it.size, section, sub, dept),
    },
  };
}

/* "venmo @jamie-r, paypal, cashapp preferred" → the methods we know, with the
   handle the seller posted for a method we list by name */
export function paymentsFrom(entries: { method: string; handle?: string | null }[]): Payment[] {
  const known = new Set(PAYMENTS.map((p) => p.id as string));
  const out: Payment[] = [];
  for (const e of entries) {
    const id = e.method.trim().toLowerCase().replace("applepay", "apple pay");
    const mapped = known.has(id) ? id : ["cashapp", "cash app", "paypal"].includes(id) ? "other" : null;
    if (!mapped || out.some((p) => p.id === mapped)) continue;
    const handle = mapped === "other" ? "" : (e.handle ?? "").trim().slice(0, 40);
    out.push({ id: mapped as Payment["id"], handle });
  }
  return out.length ? out : [{ id: "cash", handle: "" }];
}

/* Photo numbers (from 1) the model gave for an item, kept only if real:
   whole, in range, no repeats, at most `max`. Returned 0-based. */
export function pickPhotos(nums: number[], count: number, max: number): number[] {
  return [...new Set(nums)].filter((n) => Number.isInteger(n) && n >= 1 && n <= count).slice(0, max).map((n) => n - 1);
}

/* ---- where a sale is: its pickup spot, pinned to a building ---- */

// building-name words that are also everyday English: only "<word> hall" counts
const COMMON_WORDS = new Set(["little", "brown", "buyers", "community", "walker", "fu", "new", "old", "street", "college", "main", "house", "tower", "family"]);
const fold = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/* The one residential building a pickup spot names ("Yeh College, Hariri
   Hall" → "Hariri Hall", "1901 Hall" → "Class of 1901-Laughlin Hall"), or
   null: nothing named, a college only, or two buildings (no pin beats the
   wrong pin). `names` are the official names the map pins by. */
export function buildingFromText(text: string | null | undefined, names: string[]): string | null {
  const t = ` ${fold(text ?? "")} `;
  if (!t.trim()) return null;
  const hits = new Set<string>();
  for (const name of names) {
    const words = fold(name).split(" ").filter((w) => !["hall", "halls", "dorm", "class", "of", "the", "e", "s", "b", "c"].includes(w) || /^\d+$/.test(w));
    const has = (w: string) => t.includes(` ${w} `);
    const keys = words.filter((w) => !COMMON_WORDS.has(w));
    let hit = false;
    // a class year ("1901", "1976"), or every distinctive word ("kwanza jones"), or any one of a hyphenated pair ("laughlin")
    const years = keys.filter((w) => /^\d{4}$/.test(w));
    const rest = keys.filter((w) => !years.includes(w));
    if (years.some(has)) hit = true;
    else if (rest.length) hit = /-/.test(name) ? rest.some(has) : rest.every(has) || (rest.length > 1 && rest.some((w) => w.length > 4 && has(w) && !/^\d+$/.test(w)));
    // everyday words count only as "<word> hall"
    else hit = words.some((w) => t.includes(` ${w} hall `));
    // "Wendell B": a lettered building needs its letter
    const letter = name.match(/'([A-Z])'$/)?.[1]?.toLowerCase();
    if (hit && letter) hit = has(letter) || t.includes(` ${keys[0]}${letter} `);
    if (hit) hits.add(name);
  }
  const list = [...hits];
  return list.length === 1 ? list[0] : null;
}

/* ---- the seller's own instructions for the sale ---- */

/* "priority to people who don't need try-ons", "holds for 24h": shown with
   the listings. Contact details have their own fields, so they're taken out. */
export function cleanNotes(notes: string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const raw of notes ?? []) {
    const n = stripPhones(raw)
      .replace(/(\b(e-?mail|email me at|reach me at)\s*:?\s*)?[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    if (n && !out.some((o) => o.toLowerCase() === n.toLowerCase())) out.push(n);
  }
  return out.slice(0, 6);
}

/* ---- how to reach the seller ---- */

export interface ExtractedContact {
  phone: string | null;
  email: string | null;
  pickup: string | null;
  try_on: boolean | null;
}
export interface SaleContact {
  phone: string | null; // 10 digits
  email: string;
  pickup: string;
  tryOn: boolean;
}

/* What the seller's own post says about reaching them, tidied. A phone must be
   a US number; an email must look like one, else the address the sale was
   sent from. Shown on the listing once an admin approves it. */
export function cleanContact(c: ExtractedContact | null, authorEmail: string | null): SaleContact {
  let digits = (c?.phone ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  const email = (c?.email ?? "").trim().toLowerCase();
  return {
    phone: digits.length === 10 ? digits : null,
    email: /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email) ? email : (authorEmail ?? "").toLowerCase(),
    pickup: stripPhones(c?.pickup ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
    tryOn: c?.try_on === true,
  };
}

export { ALPHA_SIZES };
