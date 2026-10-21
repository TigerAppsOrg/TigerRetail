import "server-only";
/* Data Access Layer: the only module that talks to the database (Postgres,
   lib/db) and photo storage (S3, lib/storage). Callers pass the viewer's netid
   from the verified session; every write re-checks the rules here, close to
   the data, rather than trusting what the page showed. */
import { randomUUID } from "node:crypto";
import type { Listing as MapListing, Section, Seller as MapSeller } from "@/components/campus-map/types";
import { sql, type Row } from "./db";
import { AVATAR_BUCKET, avatarUrl, PHOTO_BUCKET, photoUrl, remove, upload } from "./storage";
import {
  activeCount,
  applyFilters,
  facetOptions,
  inDept,
  sortList,
  type Condition,
  type Facet,
  type Filters,
  type ListingDept,
  type Occasion,
  type Payment,
  type PaymentId,
  type Sizing,
} from "./catalog";
import {
  personLabel,
  refreshListingContact,
  offerBlocker,
  respondBlocker,
  type ItemInput,
  type ListingContact,
  type ListingStatus,
  type OfferStatus,
  type ProfileInput,
} from "./rules";
import { cleanMessage, isParticipant, isUnread, startBlocker, type ConversationState } from "./messaging";

/* How someone shows up to others: name, photo. Safe to show anyone. */
export interface Person {
  netid: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface User extends Person {
  email: string; // the Princeton address CAS vouches for
  bio: string | null;
  phone: string | null;
  payments: Payment[];
  building: string | null;
  roomDirections: string | null;
  onboarded: boolean;
}

/* Everything about a listing that anyone may see. Contact details (email,
   phone, payment handles, pickup) live in ListingContact and are loaded only
   for the seller or a buyer whose offer was accepted. */
export interface Listing {
  id: string;
  sellerNetid: string;
  title: string;
  description: string;
  priceCents: number;
  section: Section;
  sub: string;
  dept: ListingDept;
  brand: string;
  condition: Condition;
  occasion: Occasion;
  size: string;
  sizeFacet: string;
  sizing: Sizing; // what the size picker edits
  tryOn: boolean;
  photoUrls: string[]; // [0] is the cover
  photoPaths: string[]; // storage paths, in the same order
  accepts: PaymentId[]; // payment methods, without handles
  status: ListingStatus;
  createdAt: string;
  importSourceId: string | null; // set for listings that came from a listserv deck
  contactPublic: boolean; // imports: signed-in viewers see the contact details the seller's post gave
}

export interface Offer {
  id: string;
  listingId: string;
  buyerNetid: string;
  amountCents: number;
  message: string;
  status: OfferStatus;
  createdAt: string;
}

/* A failed query is a bug or an outage: it throws (postgres.js does) and
   reaches the error page and the server log instead of rendering as "empty".
   This adds which step it was to the message. */
async function step<T>(what: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    throw new Error(`${what}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/* ---- row mappers ---- */
const toPerson = (r: Row): Person => ({
  netid: r.netid as string,
  displayName: (r.display_name as string | null) ?? null,
  avatarUrl: r.avatar_path ? avatarUrl(r.avatar_path as string) : null,
});
const toUser = (r: Row): User => ({
  ...toPerson(r),
  bio: (r.bio as string | null) ?? null,
  email: `${r.netid as string}@princeton.edu`,
  phone: r.phone as string | null,
  payments: r.payments as Payment[],
  building: r.building as string | null,
  roomDirections: r.room_directions as string | null,
  onboarded: r.onboarded_at !== null,
});
const toListing = (r: Row): Listing => ({
  id: r.id as string,
  sellerNetid: r.seller_netid as string,
  title: r.title as string,
  description: r.description as string,
  priceCents: r.price_cents as number,
  section: r.section as Section,
  sub: r.sub as string,
  dept: r.dept as ListingDept,
  brand: r.brand as string,
  condition: r.condition as Condition,
  occasion: r.occasion as Occasion,
  size: r.size as string,
  sizeFacet: r.size_facet as string,
  sizing: r.sizing as Sizing,
  tryOn: r.try_on as boolean,
  photoUrls: (r.photo_paths as string[]).map(photoUrl),
  photoPaths: r.photo_paths as string[],
  accepts: (r.payments as Payment[]).map((p) => p.id),
  status: r.status as ListingStatus,
  createdAt: r.created_at as string,
  importSourceId: (r.import_source_id as string | null) ?? null,
  contactPublic: r.contact_public === true,
});
const toOffer = (r: Row): Offer => ({
  id: r.id as string,
  listingId: r.listing_id as string,
  buyerNetid: r.buyer_netid as string,
  amountCents: r.amount_cents as number,
  message: r.message as string,
  status: r.status as OfferStatus,
  createdAt: r.created_at as string,
});

/* ---- users ---- */

/* First CAS login creates the row; later logins leave it alone. */
export async function ensureUser(netid: string): Promise<User> {
  await step("create user", () => sql()`insert into users (netid) values (${netid}) on conflict (netid) do nothing`);
  return (await getUser(netid))!;
}

export async function getUser(netid: string): Promise<User | null> {
  const [row] = await step("load user", () => sql()<Row[]>`select * from users where netid = ${netid}`);
  return row ? toUser(row) : null;
}

/* Name, year and photo for a set of netids (sellers, buyers), for display. */
export async function people(netids: string[]): Promise<Map<string, Person>> {
  const ids = [...new Set(netids)];
  if (!ids.length) return new Map();
  const rows = await step("load people", () => sql()<Row[]>`select netid, display_name, avatar_path from users where netid in ${sql()(ids)}`);
  return new Map(rows.map((r) => [r.netid as string, toPerson(r)]));
}

const AVATAR_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
/* Replace (or with null, remove) a profile photo. The old file is deleted
   after the row points at the new one, so the profile never shows a broken image. */
export async function setAvatar(netid: string, photo: File | null) {
  if (photo) {
    if (!AVATAR_TYPES[photo.type]) throw new Error("Profile photos must be JPEG, PNG or WebP.");
    if (photo.size > 2 * 1024 * 1024) throw new Error("Profile photos must be under 2 MB.");
  }
  const [before] = await step("load avatar", () => sql()<Row[]>`select avatar_path from users where netid = ${netid}`);
  let path: string | null = null;
  if (photo) {
    path = `${netid}/${randomUUID()}.${AVATAR_TYPES[photo.type]}`;
    const p = path;
    await step("upload profile photo", async () => upload(AVATAR_BUCKET, p, await photo.arrayBuffer(), photo.type));
  }
  await step("save profile photo", () => sql()`update users set avatar_path = ${path} where netid = ${netid}`);
  const old = before?.avatar_path as string | null | undefined;
  if (old) await remove(AVATAR_BUCKET, [old]).catch((e) => console.error(`[profile] couldn't delete old photo ${old}: ${e}`));
}

/* "whatever you tick here is saved as your default for next time" (sell step 1) */
export async function saveDefaultPayments(netid: string, payments: Payment[]) {
  await step("save default payments", () => sql()`update users set payments = ${sql().json(payments as never)} where netid = ${netid}`);
}

export async function saveProfile(netid: string, p: ProfileInput) {
  const existing = await getUser(netid);
  const patch: Row = {
    phone: p.phone,
    payments: sql().json(p.payments as never),
    building: p.building,
    room_directions: p.roomDirections || null,
    ...(p.about ? { display_name: p.about.displayName, bio: p.about.bio } : {}),
    ...(existing?.onboarded ? {} : { onboarded_at: new Date().toISOString() }),
  };
  await step("save profile", () => sql()`update users set ${sql()(patch)} where netid = ${netid}`);

  // live listings follow the new phone and handles (rules: refreshListingContact)
  const live = await step("load live listings", () => sql()<Row[]>`select id, contact_phone, payments from listings where seller_netid = ${netid} and status = 'active'`);
  for (const l of live) {
    const next = refreshListingContact({ phone: l.contact_phone as string | null, payments: l.payments as Payment[] }, existing?.phone ?? null, p);
    await step("update listing contact", () => sql()`update listings set contact_phone = ${next.phone}, payments = ${sql().json(next.payments as never)} where id = ${l.id as string}`);
  }
}

/* ---- listings ---- */

export async function recentListings(limit = 60): Promise<Listing[]> {
  const rows = await step("load feed", () => sql()<Row[]>`select * from listings where status = 'active' order by created_at desc limit ${limit}`);
  return rows.map(toListing);
}

export interface BrowseQuery {
  section?: string;
  subs?: string[]; // any of these subcategories (empty = the whole section)
  dept: string;
  q?: string;
  filters: Filters;
  limit: number;
}
export interface BrowseResult {
  items: Listing[]; // this page of results
  matches: Listing[]; // every match (the map view shows them all)
  total: number;
  options: Partial<Record<Facet, string[]>>;
  activeFilters: number;
}

/* Home and browse. Section/sub narrow in SQL; department, search and the
   filter rail run in lib/catalog (the wireframe's rules, unit tested).
   Fine up to a few thousand live listings; past that, move them into SQL. */
const BROWSE_CAP = 2000;
export async function browse(qry: BrowseQuery): Promise<BrowseResult> {
  const q0 = sql();
  const rows = await step("browse", () => q0<Row[]>`
    select * from listings
    where status = 'active'
      ${qry.section ? q0`and section = ${qry.section}` : q0``}
      ${qry.section && qry.subs?.length ? q0`and sub in ${q0(qry.subs)}` : q0``}
    order by created_at desc
    limit ${BROWSE_CAP}`);

  let base = rows.map(toListing).filter((l) => inDept(l, qry.dept));
  const q = qry.q?.trim().toLowerCase();
  if (q) base = base.filter((l) => `${l.title} ${l.brand} ${l.sub}`.toLowerCase().includes(q));

  const all = sortList(applyFilters(base, qry.filters), qry.filters.sort);
  return { items: all.slice(0, qry.limit), matches: all, total: all.length, options: facetOptions(base, qry.filters), activeFilters: activeCount(qry.filters) };
}

/* Contact details for one listing. Callers must have checked the viewer is
   the seller or a buyer with an accepted offer (lib/rules). */
export async function listingContact(id: string): Promise<ListingContact & { pickupBuilding: string | null; roomDirections: string | null }> {
  const [r] = await step("load listing contact", () => sql()<Row[]>`
    select l.contact_email, l.contact_phone, l.pickup, l.payments, u.building, u.room_directions
    from listings l left join users u on u.netid = l.seller_netid
    where l.id = ${id}`);
  if (!r) throw new Error("load listing contact: no such listing");
  return {
    email: r.contact_email as string,
    phone: r.contact_phone as string | null,
    pickup: r.pickup as string,
    payments: r.payments as Payment[],
    pickupBuilding: (r.building as string | null) ?? null,
    roomDirections: (r.room_directions as string | null) ?? null,
  };
}

export async function getListing(id: string): Promise<Listing | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await step("load listing", () => sql()<Row[]>`select * from listings where id = ${id}`);
  return row ? toListing(row) : null;
}

/* What anyone can see about a person: name, photo, bio, dorm (their map pin
   shows it anyway) and what they have up. Never their phone, email, payment
   handles or room directions. null for nobody, or the listserv account. */
export async function publicProfile(netid: string): Promise<{ person: Person; bio: string | null; building: string | null; listings: Listing[] } | null> {
  if (netid === "listserv") return null;
  const u = await getUser(netid);
  if (!u) return null;
  const listings = (await listingsBySeller(netid)).filter((l) => l.status === "active");
  return { person: { netid: u.netid, displayName: u.displayName, avatarUrl: u.avatarUrl }, bio: u.bio, building: u.building, listings };
}

export async function listingsBySeller(netid: string): Promise<Listing[]> {
  const rows = await step("load my listings", () => sql()<Row[]>`select * from listings where seller_netid = ${netid} order by created_at desc`);
  return rows.map(toListing);
}

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
// No HEIC: most browsers can't display it. iPhones convert to JPEG when uploading through a file picker.
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export function photoProblem(photo: File): string | null {
  if (photo.size === 0) return "That photo is empty.";
  if (!PHOTO_TYPES[photo.type]) return "Photos must be JPEG, PNG or WebP.";
  if (photo.size > MAX_PHOTO_BYTES) return "Photos must be under 8 MB.";
  return null;
}

/* Publish a batch (sell step 2): every photo uploads, then every row inserts
   in one statement. If anything fails, the photos already uploaded are
   removed again so storage never holds orphans, and the error propagates. */
export async function createBatch(
  sellerNetid: string,
  contact: ListingContact,
  items: { input: ItemInput; photos: File[] }[],
): Promise<string[]> {
  for (const { photos } of items) {
    for (const p of photos) {
      const problem = photoProblem(p);
      if (problem) throw new Error(problem);
    }
  }
  const uploaded: string[] = [];
  try {
    const rows: Row[] = [];
    for (const { input, photos } of items) {
      const paths: string[] = [];
      for (const photo of photos) {
        const path = `${sellerNetid}/${randomUUID()}.${PHOTO_TYPES[photo.type]}`;
        await step("upload photo", async () => upload(PHOTO_BUCKET, path, await photo.arrayBuffer(), photo.type));
        uploaded.push(path);
        paths.push(path);
      }
      rows.push({
        seller_netid: sellerNetid,
        title: input.title,
        description: input.description,
        price_cents: input.priceCents,
        section: input.section,
        sub: input.sub,
        dept: input.dept,
        brand: input.brand,
        condition: input.condition,
        occasion: input.occasion,
        sizing: sql().json(input.sizing as never),
        size: input.size,
        size_facet: input.sizeFacet,
        try_on: input.tryOn,
        photo_paths: sql().array(paths),
        contact_email: contact.email,
        contact_phone: contact.phone,
        pickup: contact.pickup,
        payments: sql().json(contact.payments as never),
      });
    }
    const inserted = await step("publish listings", () => sql()<{ id: string }[]>`insert into listings ${sql()(rows)} returning id`);
    return inserted.map((r) => r.id);
  } catch (e) {
    if (uploaded.length) {
      await remove(PHOTO_BUCKET, uploaded).catch((err) => console.error(`[sell] failed to clean up ${uploaded.length} photos after a failed publish: ${err}`));
    }
    throw e;
  }
}

/* Who may edit a listing: its seller; an admin, an import nobody has claimed yet. */
export const canEditListing = (l: Pick<Listing, "sellerNetid" | "importSourceId">, viewer: string | null | undefined, admin: boolean) =>
  !!viewer && (l.sellerNetid === viewer || (admin && l.sellerNetid === "listserv" && !!l.importSourceId));

/* Edit a listing: its details, and its photos in the order the editor left
   them (stored paths kept, new files uploaded). Photos taken off are deleted
   unless another listing still shows them (items on one slide share photos).
   Contact details and status stay as they are. */
export async function updateListing(
  listingId: string,
  input: ItemInput,
  photos: ({ path: string } | { file: File })[],
): Promise<void> {
  const [listing] = await step("load listing", () => sql()<Row[]>`select seller_netid, photo_paths from listings where id = ${listingId}`);
  if (!listing) throw new Error("That listing is gone.");
  const before = listing.photo_paths as string[];
  for (const p of photos) {
    if ("path" in p && !before.includes(p.path)) throw new Error("A photo that isn't this listing's was sent.");
    if ("file" in p) {
      const problem = photoProblem(p.file);
      if (problem) throw new Error(problem);
    }
  }
  const uploaded: string[] = [];
  try {
    const paths: string[] = [];
    for (const p of photos) {
      if ("path" in p) {
        paths.push(p.path);
        continue;
      }
      const path = `${listing.seller_netid as string}/${randomUUID()}.${PHOTO_TYPES[p.file.type]}`;
      const file = p.file;
      await step("upload photo", async () => upload(PHOTO_BUCKET, path, await file.arrayBuffer(), file.type));
      uploaded.push(path);
      paths.push(path);
    }
    const patch: Row = {
      title: input.title,
      description: input.description,
      price_cents: input.priceCents,
      section: input.section,
      sub: input.sub,
      dept: input.dept,
      brand: input.brand,
      condition: input.condition,
      occasion: input.occasion,
      sizing: sql().json(input.sizing as never),
      size: input.size,
      size_facet: input.sizeFacet,
      try_on: input.tryOn,
      photo_paths: sql().array(paths),
    };
    await step("save listing", () => sql()`update listings set ${sql()(patch)} where id = ${listingId}`);
  } catch (e) {
    if (uploaded.length) await remove(PHOTO_BUCKET, uploaded).catch(() => {});
    throw e;
  }
  // photos taken off, unless another listing still uses them
  const gone = before.filter((p) => !photos.some((x) => "path" in x && x.path === p));
  if (gone.length) {
    const still = await step("check photos", () => sql()<Row[]>`select photo_paths from listings where photo_paths && ${sql().array(gone)}`);
    const keep = new Set(still.flatMap((r) => r.photo_paths as string[]));
    const unused = gone.filter((p) => !keep.has(p));
    if (unused.length) await remove(PHOTO_BUCKET, unused).catch((e) => console.error(`[edit] couldn't delete ${unused.length} removed photos: ${e}`));
  }
}

export async function markSold(listingId: string, viewer: string) {
  const listing = await getListing(listingId);
  if (!listing || listing.sellerNetid !== viewer) throw new Error("Only the seller can mark this sold.");
  await step("mark sold", () => sql()`update listings set status = 'sold' where id = ${listingId}`);
  // Anyone still waiting hears "no" instead of waiting forever.
  await step("decline open offers", () => sql()`update offers set status = 'declined' where listing_id = ${listingId} and status = 'pending'`);
}

/* ---- offers ---- */

export async function offersOnListing(listingId: string): Promise<Offer[]> {
  const rows = await step("load offers", () => sql()<Row[]>`select * from offers where listing_id = ${listingId} order by created_at`);
  return rows.map(toOffer);
}

/* One offer per buyer per item: offering again updates the amount and
   reopens it, unless the seller already accepted. */
export async function makeOffer(listingId: string, buyer: string, amountCents: number, message: string) {
  const listing = await getListing(listingId);
  if (!listing) throw new Error("That listing doesn't exist.");
  const blocked = offerBlocker(listing, buyer);
  if (blocked) throw new Error(blocked);

  const existing = (await offersOnListing(listingId)).find((o) => o.buyerNetid === buyer);
  if (existing?.status === "accepted") throw new Error("The seller already accepted your offer.");

  await step("make offer", () => sql()`
    insert into offers (listing_id, buyer_netid, amount_cents, message, status)
    values (${listingId}, ${buyer}, ${amountCents}, ${message}, 'pending')
    on conflict (listing_id, buyer_netid)
    do update set amount_cents = excluded.amount_cents, message = excluded.message, status = 'pending'`);
}

export async function respondToOffer(offerId: string, viewer: string, accept: boolean): Promise<string> {
  if (!/^[0-9a-f-]{36}$/i.test(offerId)) throw new Error("That offer doesn't exist.");
  const [row] = await step("load offer", () => sql()<Row[]>`select * from offers where id = ${offerId}`);
  if (!row) throw new Error("That offer doesn't exist.");
  const offer = toOffer(row);
  const listing = await getListing(offer.listingId);
  if (!listing) throw new Error("That listing doesn't exist.");
  const blocked = respondBlocker(listing, offer, viewer);
  if (blocked) throw new Error(blocked);

  await step("respond to offer", () => sql()`update offers set status = ${accept ? "accepted" : "declined"} where id = ${offerId}`);
  return listing.id;
}

export interface MyOffer extends Offer {
  listing: Listing;
}

export async function offersByBuyer(netid: string): Promise<MyOffer[]> {
  const offers = await step("load my offers", () => sql()<Row[]>`select * from offers where buyer_netid = ${netid} order by created_at desc`);
  if (!offers.length) return [];
  const ids = [...new Set(offers.map((o) => o.listing_id as string))];
  const listings = await step("load my offers' listings", () => sql()<Row[]>`select * from listings where id in ${sql()(ids)}`);
  const byId = new Map(listings.map((l) => [l.id as string, toListing(l)]));
  return offers.filter((o) => byId.has(o.listing_id as string)).map((o) => ({ ...toOffer(o), listing: byId.get(o.listing_id as string)! }));
}

/* ---- map ---- */

/* Listings shaped for <CampusMap>. Sellers without a building can't be
   placed, so they're left off the map (their items still show in the list).
   A listserv sale nobody has claimed is its own "seller", pinned at the
   building its pickup spot names, if it names one. */
export async function mapFor(listings: Listing[]): Promise<{ sellers: MapSeller[]; listings: MapListing[] }> {
  const netids = [...new Set(listings.map((l) => l.sellerNetid))];
  const users = netids.length
    ? await step("load sellers", () => sql()<Row[]>`select netid, building, display_name from users where netid in ${sql()(netids)} and building is not null`)
    : [];
  const saleIds = [...new Set(listings.filter((l) => l.sellerNetid === "listserv" && l.importSourceId).map((l) => l.importSourceId!))];
  const sales = saleIds.length
    ? await step("load sale places", () => sql()<Row[]>`select id, building, author_name from import_sources where id in ${sql()(saleIds)} and building is not null`)
    : [];
  const pinOf = (l: Listing) => (l.sellerNetid === "listserv" ? `sale:${l.importSourceId}` : l.sellerNetid);
  const placed = new Set([...users.map((u) => u.netid as string), ...sales.map((s) => `sale:${s.id as string}`)]);
  return {
    // room directions stay private: they're only shown after an accepted offer, on the listing page
    sellers: [
      ...users.map((u) => ({ id: u.netid as string, name: personLabel(toPerson(u)), building: u.building as string, roomDirections: "" })),
      ...sales.map((s) => ({
        id: `sale:${s.id as string}`,
        name: (s.author_name as string | null) ?? "a listserv sale",
        building: s.building as string,
        roomDirections: "",
      })),
    ],
    listings: listings
      .filter((l) => placed.has(pinOf(l)))
      .map((l) => ({
        id: l.id,
        sellerId: pinOf(l),
        title: l.title,
        price: l.priceCents / 100,
        section: l.section,
        sub: l.sub,
        // the map colours women's / men's / misc; unisex apparel joins misc there
        dept: l.dept === "unisex" ? "misc" : l.dept,
        imageUrl: l.photoUrls[0],
        postedAt: l.createdAt,
      })),
  };
}

/* Everything active, for the all-campus map page. */
export async function mapMarketplace() {
  return mapFor(await recentListings(1000));
}

/* ---- messaging ---- */

export interface Message {
  id: string;
  senderNetid: string;
  body: string;
  createdAt: string;
}
export interface Conversation extends ConversationState {
  id: string;
  listingId: string;
}
export interface ConversationView {
  conversation: Conversation;
  listing: { id: string; title: string; priceCents: number; photoUrl: string; status: ListingStatus };
  other: Person;
  messages: Message[];
}
export interface InboxRow {
  id: string;
  listing: { id: string; title: string; photoUrl: string };
  other: Person;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastFromMe: boolean;
  unread: boolean;
}

const toConversation = (r: Row): Conversation => ({
  id: r.id as string,
  listingId: r.listing_id as string,
  buyerNetid: r.buyer_netid as string,
  sellerNetid: r.seller_netid as string,
  lastMessageAt: r.last_message_at as string | null,
  lastSenderNetid: r.last_sender_netid as string | null,
  buyerReadAt: r.buyer_read_at as string | null,
  sellerReadAt: r.seller_read_at as string | null,
});
const toMessage = (r: Row): Message => ({
  id: r.id as string,
  senderNetid: r.sender_netid as string,
  body: r.body as string,
  createdAt: r.created_at as string,
});
const uuidish = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/* Open (or reopen) the conversation about a listing. Buyers start their own;
   a seller may start one with someone who offered (rules: startBlocker). */
export async function startConversation(listingId: string, viewer: string, withBuyer: string | null): Promise<string> {
  const listing = await getListing(listingId);
  if (!listing) throw new Error("That listing doesn't exist.");
  const buyer = withBuyer ?? viewer;
  const hasOffer = withBuyer !== null && (await offersOnListing(listingId)).some((o) => o.buyerNetid === withBuyer);
  const [existing] = await step("find conversation", () => sql()<Row[]>`select id from conversations where listing_id = ${listingId} and buyer_netid = ${buyer}`);
  if (existing) return existing.id as string; // already talking: just go there, even if the item has since sold
  const blocked = startBlocker(listing, viewer, withBuyer, hasOffer);
  if (blocked) throw new Error(blocked);
  const [row] = await step("start conversation", () => sql()<{ id: string }[]>`
    insert into conversations (listing_id, buyer_netid, seller_netid) values (${listingId}, ${buyer}, ${listing.sellerNetid}) returning id`);
  return row.id;
}

async function loadConversation(id: string, viewer: string): Promise<Conversation> {
  if (!uuidish(id)) throw new Error("That conversation doesn't exist.");
  const [row] = await step("load conversation", () => sql()<Row[]>`select * from conversations where id = ${id}`);
  const c = row ? toConversation(row) : null;
  // someone else's conversation looks exactly like a missing one
  if (!c || !isParticipant(c, viewer)) throw new Error("That conversation doesn't exist.");
  return c;
}

async function markRead(c: Conversation, viewer: string) {
  const col = c.buyerNetid === viewer ? "buyer_read_at" : "seller_read_at";
  await step("mark read", () => sql()`update conversations set ${sql()({ [col]: new Date().toISOString() })} where id = ${c.id}`);
}

/* The whole thread, marked read for the viewer. Null if it isn't theirs. */
export async function conversationFor(id: string, viewer: string): Promise<ConversationView | null> {
  let c: Conversation;
  try {
    c = await loadConversation(id, viewer);
  } catch {
    return null;
  }
  const otherNetid = c.buyerNetid === viewer ? c.sellerNetid : c.buyerNetid;
  const [listing, who, rows] = await Promise.all([
    getListing(c.listingId),
    people([otherNetid]),
    step("load messages", () => sql()<Row[]>`select * from messages where conversation_id = ${c.id} order by created_at`),
  ]);
  if (!listing) return null;
  await markRead(c, viewer);
  return {
    conversation: c,
    listing: { id: listing.id, title: listing.title, priceCents: listing.priceCents, photoUrl: listing.photoUrls[0], status: listing.status },
    other: who.get(otherNetid) ?? { netid: otherNetid, displayName: null, avatarUrl: null },
    messages: rows.map(toMessage),
  };
}

export async function sendMessage(conversationId: string, sender: string, input: string): Promise<Message> {
  const c = await loadConversation(conversationId, sender);
  const cleaned = cleanMessage(input);
  if (!cleaned.ok) throw new Error(cleaned.error);
  const [row] = await step("send message", () => sql()<Row[]>`
    insert into messages (conversation_id, sender_netid, body) values (${c.id}, ${sender}, ${cleaned.body}) returning *`);
  const m = toMessage(row);
  const readCol = c.buyerNetid === sender ? "buyer_read_at" : "seller_read_at";
  await step("update conversation", () => sql()`
    update conversations set ${sql()({ last_message_at: m.createdAt, last_sender_netid: sender, [readCol]: m.createdAt })} where id = ${c.id}`);
  return m;
}

/* For the open thread's polling: messages after `afterIso`, marking read. */
export async function messagesSince(conversationId: string, viewer: string, afterIso: string | null): Promise<Message[]> {
  const c = await loadConversation(conversationId, viewer);
  const q0 = sql();
  const rows = (
    await step("load new messages", () => q0<Row[]>`
      select * from messages where conversation_id = ${c.id} ${afterIso ? q0`and created_at > ${afterIso}` : q0``} order by created_at`)
  ).map(toMessage);
  if (rows.length) await markRead(c, viewer);
  return rows;
}

export async function inbox(viewer: string): Promise<InboxRow[]> {
  const rows = await step("load inbox", () => sql()<Row[]>`
    select c.*, l.title as listing_title, l.photo_paths as listing_photo_paths
    from conversations c join listings l on l.id = c.listing_id
    where (c.buyer_netid = ${viewer} or c.seller_netid = ${viewer}) and c.last_message_at is not null
    order by c.last_message_at desc`);
  const convs = rows.map((r) => ({ c: toConversation(r), l: r }));
  const others = convs.map(({ c }) => (c.buyerNetid === viewer ? c.sellerNetid : c.buyerNetid));
  const ids = convs.map(({ c }) => c.id);
  const [who, lasts] = await Promise.all([
    people(others),
    ids.length
      ? step("load last messages", () => sql()<Row[]>`
          select distinct on (conversation_id) conversation_id, body from messages
          where conversation_id in ${sql()(ids)} order by conversation_id, created_at desc`)
      : Promise.resolve([] as Row[]),
  ]);
  const lastBody = new Map(lasts.map((r) => [r.conversation_id as string, r.body as string]));
  return convs.map(({ c, l }, i) => ({
    id: c.id,
    listing: { id: c.listingId, title: l.listing_title as string, photoUrl: photoUrl((l.listing_photo_paths as string[])[0]) },
    other: who.get(others[i]) ?? { netid: others[i], displayName: null, avatarUrl: null },
    lastMessage: lastBody.get(c.id) ?? null,
    lastMessageAt: c.lastMessageAt,
    lastFromMe: c.lastSenderNetid === viewer,
    unread: isUnread(c, viewer),
  }));
}

export async function unreadCount(viewer: string): Promise<number> {
  const rows = await step("count unread", () => sql()<Row[]>`
    select buyer_netid, seller_netid, last_message_at, last_sender_netid, buyer_read_at, seller_read_at
    from conversations
    where (buyer_netid = ${viewer} or seller_netid = ${viewer}) and last_message_at is not null`);
  return rows.map(toConversation).filter((c) => isUnread(c, viewer)).length;
}
