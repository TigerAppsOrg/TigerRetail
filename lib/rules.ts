/* Marketplace rules as pure functions: form parsing and who-may-do-what.
   No I/O, so every rule is unit tested and the server actions stay thin. */
import type { Section } from "@/components/campus-map/types";
import {
  APPAREL,
  APPAREL_DEPTS,
  CONDITIONS,
  OCCASIONS,
  PAYMENTS,
  cleanSizing,
  isSection,
  sizeFacet,
  sizeLabel,
  subsOf,
  type Condition,
  type ListingDept,
  type Occasion,
  type Payment,
  type PaymentId,
  type Sizing,
} from "./catalog";

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

/* "12", "12.5", "$12.50" → 1250. Rejects anything else rather than rounding a typo. */
export function parseDollars(input: string): number | null {
  const m = input.trim().replace(/^\$/, "").match(/^(\d{1,5})(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}

export const formatCents = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${(c / 100).toFixed(2)}`);

/* "+1 (609) 555-0123" → "6095550123", or null if it isn't a 10-digit US number */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const phone = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return phone.length === 10 ? phone : null;
}
export const formatPhone = (p: string) => (p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : p);

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/* Ticked payment methods with their handles. A method that needs a handle
   (venmo, zelle, …) without one is an error: buyers wouldn't know where to pay. */
export function parsePayments(picked: { id: string; handle: string }[]): Parsed<Payment[]> {
  const out: Payment[] = [];
  const missing: string[] = [];
  for (const def of PAYMENTS) {
    const p = picked.find((x) => x.id === def.id);
    if (!p) continue;
    const handle = str(p.handle).slice(0, 80);
    if (def.needsHandle && !handle) missing.push(def.label);
    out.push({ id: def.id as PaymentId, handle });
  }
  if (out.length === 0) return { ok: false, errors: { payments: "Pick at least one way to get paid." } };
  if (missing.length) return { ok: false, errors: { payments: `Add ${missing.join(" and ")} details so buyers know where to send it.` } };
  return { ok: true, value: out };
}

/* Payment rows from a form: checkbox `pay` = id, text `handle:<id>` = handle. */
export function paymentsFromForm(f: { getAll(name: string): FormDataEntryValue[]; get(name: string): FormDataEntryValue | null }) {
  return f.getAll("pay").map((id) => ({ id: String(id), handle: str(f.get(`handle:${String(id)}`)) }));
}

/* ---- account (onboarding + settings) ---- */

export interface ProfileInput {
  phone: string;
  payments: Payment[];
  building: string;
  roomDirections: string;
  /* only present when the form had the "about you" fields (the profile page,
     not onboarding), so onboarding can never blank them */
  about?: AboutInput;
}
export interface AboutInput {
  displayName: string | null;
  bio: string | null;
}

/* how a person shows up: "Raj P.", or the netid */
export function personLabel(p: { netid: string; displayName?: string | null }): string {
  return p.displayName?.trim() || p.netid;
}
export const initials = (p: { netid: string; displayName?: string | null }) =>
  (p.displayName?.trim() || p.netid)
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function parseProfile(f: { get(name: string): FormDataEntryValue | null; getAll(name: string): FormDataEntryValue[] }): Parsed<ProfileInput> {
  const errors: Record<string, string> = {};
  const phone = normalizePhone(str(f.get("phone")));
  const pay = parsePayments(paymentsFromForm(f));
  const building = str(f.get("building"));
  const roomDirections = str(f.get("roomDirections"));

  if (!phone) errors.phone = "Enter a 10-digit US phone number.";
  if (!pay.ok) Object.assign(errors, pay.errors);
  if (!building) errors.building = "Pick the building you live in.";
  if (roomDirections.length > 200) errors.roomDirections = "Keep directions under 200 characters.";

  let about: AboutInput | undefined;
  if (f.get("displayName") !== null) {
    const displayName = str(f.get("displayName"));
    const bio = str(f.get("bio"));
    if (displayName.length > 40) errors.displayName = "Keep your name under 40 characters.";
    if (bio.length > 160) errors.bio = "Keep your bio under 160 characters.";
    about = { displayName: displayName || null, bio: bio || null };
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { phone: phone!, payments: (pay as { value: Payment[] }).value, building, roomDirections, ...(about ? { about } : {}) } };
}

/* ---- sell step 1: how buyers reach you about this batch ---- */

export interface ContactChoice {
  emailMode: "default" | "alt";
  altEmail: string;
  phoneMode: "default" | "alt" | "none";
  altPhone: string;
  pickup: string;
  payments: { id: string; handle: string }[];
}
export interface ListingContact {
  email: string;
  phone: string | null;
  pickup: string;
  payments: Payment[];
}

export function parseContact(c: ContactChoice, defaults: { email: string; phone: string | null }): Parsed<ListingContact> {
  const errors: Record<string, string> = {};
  let email = defaults.email;
  if (c.emailMode === "alt") {
    email = str(c.altEmail).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter an email address like you@princeton.edu.";
  }
  let phone: string | null = defaults.phone;
  if (c.phoneMode === "alt") {
    phone = normalizePhone(str(c.altPhone));
    if (!phone) errors.phone = "Enter a 10-digit US phone number.";
  } else if (c.phoneMode === "none") {
    phone = null;
  }
  const pickup = str(c.pickup);
  if (pickup.length > 500) errors.pickup = "Keep pickup instructions under 500 characters.";
  const pay = parsePayments(c.payments ?? []);
  if (!pay.ok) Object.assign(errors, pay.errors);

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { email, phone, pickup, payments: (pay as { value: Payment[] }).value } };
}

/* ---- sell step 2: one card per item ---- */

export interface ItemDraft {
  title: string;
  price: string;
  section: string;
  sub: string;
  occasion: string;
  condition: string;
  dept: string;
  brand: string;
  sizing: unknown;
  tryOn: boolean;
  desc: string;
  photoCount: number;
}

export interface ItemInput {
  title: string;
  priceCents: number;
  section: Section;
  sub: string;
  occasion: Occasion;
  condition: Condition;
  dept: ListingDept;
  brand: string;
  sizing: Sizing;
  size: string;
  sizeFacet: string;
  tryOn: boolean;
  description: string;
}

export const MAX_PHOTOS = 8;

/* A card with no name, no price and no photo is skipped, as the wireframe says ("blank cards are skipped"). */
export const isBlankItem = (d: ItemDraft) => !str(d.title) && !str(d.price) && d.photoCount === 0;

/* Editing a listing: keep the stored size when the seller didn't touch it
   (imports carry sizes the picker can't make, like "26 waist"), and allow an
   import's condition "not stated". */
export interface EditOptions {
  keepSize?: { sizing: unknown; size: string; sizeFacet: string };
  allowNotStated?: boolean;
}

export function parseItem(d: ItemDraft, edit: EditOptions = {}): Parsed<ItemInput> {
  const errors: Record<string, string> = {};
  const title = str(d.title);
  const priceCents = parseDollars(str(d.price));
  const section = str(d.section);
  const sub = str(d.sub);
  const brand = str(d.brand);
  const description = str(d.desc);

  if (!title) errors.title = "Give it a name.";
  else if (title.length > 120) errors.title = "Keep the name under 120 characters.";
  if (priceCents === null || priceCents <= 0) errors.price = "Enter a price above $0, like 15 or 15.50.";
  if (d.photoCount < 1) errors.photos = "Add at least one photo.";
  else if (d.photoCount > MAX_PHOTOS) errors.photos = `Up to ${MAX_PHOTOS} photos per item.`;
  if (!isSection(section)) errors.section = "Pick a category.";
  else if (!subsOf(section).includes(sub)) errors.sub = "Pick a subcategory.";
  const conditionOk = (CONDITIONS as readonly string[]).includes(d.condition) || (edit.allowNotStated && d.condition === "not stated");
  if (!conditionOk) errors.condition = "Pick a condition.";
  if (!(OCCASIONS as readonly string[]).includes(d.occasion)) errors.occasion = "Pick an occasion.";
  if (brand.length > 60) errors.brand = "Keep the brand under 60 characters.";
  if (description.length > 2000) errors.desc = "Keep the description under 2000 characters.";

  const apparel = isSection(section) && APPAREL.has(section);
  let dept: ListingDept = "misc";
  if (apparel) {
    if ((APPAREL_DEPTS as readonly string[]).includes(d.dept)) dept = d.dept as ListingDept;
    else errors.dept = "Pick a department.";
  }
  const sizing = edit.keepSize ? null : isSection(section) ? cleanSizing(d.sizing, section, sub) : null;
  if (!edit.keepSize && isSection(section) && !errors.sub && !sizing) errors.size = "Pick a size.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      priceCents: priceCents!,
      section: section as Section,
      sub,
      occasion: d.occasion as Occasion,
      condition: d.condition as Condition,
      dept,
      brand,
      ...(edit.keepSize
        ? { sizing: edit.keepSize.sizing as Sizing, size: edit.keepSize.size, sizeFacet: edit.keepSize.sizeFacet }
        : { sizing: sizing!, size: sizeLabel(sizing!), sizeFacet: sizeFacet(sizing!) }),
      tryOn: apparel && d.tryOn === true,
      description,
    },
  };
}

/* ---- profile edits reach live listings ----
   Each listing keeps its own contact (sell flow), but a buyer must never be
   sent to an old Venmo handle. So when the profile changes:
   - phone: listings that used the old default get the new one; a listing
     with a different number, or none ("don't use my number"), keeps it
   - payments: methods still on the profile take the profile's handle;
     methods taken off the profile come off the listing, unless that would
     leave it with none, in which case it gets the profile's methods */
export function refreshListingContact(
  listing: { phone: string | null; payments: Payment[] },
  oldPhone: string | null,
  profile: { phone: string; payments: Payment[] },
): { phone: string | null; payments: Payment[] } {
  const phone = listing.phone !== null && listing.phone === oldPhone ? profile.phone : listing.phone;
  const kept = listing.payments
    .map((p) => profile.payments.find((q) => q.id === p.id))
    .filter((p): p is Payment => p !== undefined);
  return { phone, payments: kept.length ? kept : profile.payments };
}

/* ---- who may do what ---- */

export type ListingStatus = "review" | "active" | "sold";
export type OfferStatus = "pending" | "accepted" | "declined";

export function offerBlocker(listing: { sellerNetid: string; status: ListingStatus }, viewer: string): string | null {
  if (listing.sellerNetid === viewer) return "This is your listing.";
  if (listing.status !== "active") return "This item has been sold.";
  return null;
}

export function respondBlocker(
  listing: { sellerNetid: string; status: ListingStatus },
  offer: { status: OfferStatus },
  viewer: string,
): string | null {
  if (listing.sellerNetid !== viewer) return "Only the seller can respond to offers.";
  if (listing.status !== "active") return "This item has already been sold.";
  if (offer.status !== "pending") return `This offer was already ${offer.status}.`;
  return null;
}

/* Contact details (phone, payment handles, pickup) are shared only between a
   seller and a buyer whose offer the seller accepted. The seller sees that
   buyer's contact on the accepted offer; this decides the buyer's side. */
export function buyerSeesSellerContact(viewer: string, offers: { buyerNetid: string; status: OfferStatus }[]): boolean {
  return offers.some((o) => o.status === "accepted" && o.buyerNetid === viewer);
}
