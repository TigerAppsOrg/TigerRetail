import "server-only";
/* Listserv import: sale emails (from InboxEngine) → their Google Slides decks,
   or the items written in the email itself with its photos → one listing per
   item, waiting for admin review under the "listserv" account until the
   seller claims them.

   Every step that can fail records why on the import_sources row; nothing
   is half-published (a failed sale's photos are removed again). */
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { APPAREL, isSection, subsOf, type ListingDept, type Payment } from "../catalog";
import type { User } from "../data";
import { sql, type Row } from "../db";
import { PHOTO_BUCKET, photoUrl, remove, upload } from "../storage";
import { fetchResidentialBuildings } from "@/components/campus-map/princeton";
import { download } from "./download";
import { assignPhotos, extractContact, extractDeck, extractEmailSale, sortItems } from "./extract";
import { photosBySlide, slideTexts, withoutTemplateArt } from "./pptx";
import {
  IMPORT_ACCOUNT,
  SALE_QUERY,
  bodySaleCandidate,
  buildingFromText,
  cleanContact,
  cleanNotes,
  deckExportUrl,
  deckIdsIn,
  deckUrl,
  digestContact,
  fetchablePhotoUrl,
  linksIn,
  netidFromEmail,
  parseSizeText,
  paymentsFrom,
  pickPhotos,
  saleAuthor,
  toDraft,
  type ImportDraft,
  type SaleContact,
} from "./rules";

export { IMPORT_ACCOUNT };
const FIRST_RUN_DAYS = 30;
const MAX_PDF_BYTES = 200 * 1024 * 1024; // the Files API takes up to 500 MB; anything near this is not a sale deck
const MAX_PPTX_BYTES = 500 * 1024 * 1024; // photo-heavy decks export big: a real 98-slide one was 207 MB
const STALE_PENDING_MS = 15 * 60_000; // a deck "pending" this long was cut off (the server died mid-read)
const MAX_PHOTOS_PER_ITEM = 4;
const MAX_PHOTOS_PER_SLIDE = 12;
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

async function step<T>(what: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    throw new Error(`${what}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
const uploadJpeg = (path: string, jpeg: Buffer) => step("upload photo", () => upload(PHOTO_BUCKET, path, jpeg, "image/jpeg"));

export interface EmailMeta {
  messageId: string | null;
  subject: string;
  text: string;
  listserv: string | null;
  authorName: string | null;
  authorEmail: string | null;
  sentAt: string | null;
}
export interface DeckResult {
  deckId: string;
  sourceId?: string;
  status: "imported" | "skipped" | "failed";
  detail: string;
  created: number;
}
export interface EmailSaleResult {
  messageId: string;
  status: "imported" | "skipped" | "failed";
  detail: string;
  created: number;
}

/* ---- fetching a public deck ---- */

async function fetchExport(deckId: string, fmt: "pdf" | "pptx", expect: string): Promise<Uint8Array> {
  const res = await download(deckExportUrl(deckId, fmt), { maxBytes: fmt === "pdf" ? MAX_PDF_BYTES : MAX_PPTX_BYTES }).catch((e: Error) => {
    throw new Error(`the deck's ${fmt} export: ${e.message}${/limit/.test(e.message) ? " (too big to be a sale deck)" : ""}`);
  });
  if (res.status !== 200 || !res.type.startsWith(expect)) {
    // a private deck answers with Google's sign-in page (HTML)
    throw new Error(res.type.includes("text/html") ? "the deck isn't shared publicly" : `Google returned ${res.status} ${res.type} for the ${fmt} export`);
  }
  return new Uint8Array(res.bytes.buffer, res.bytes.byteOffset, res.bytes.byteLength);
}

/* phone photos → ≤1600px JPEG, like listings people post themselves; icons are dropped */
async function prepare(bytes: Uint8Array): Promise<Buffer | null> {
  const img = sharp(bytes, { animated: false });
  const meta = await img.metadata();
  if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < 150) return null;
  return img.rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
}

/* Which of a slide's images go with which of its items (indexes into
   `jpegs`). One image: it's the item's. More: Claude matches them, so the
   lace top isn't shown with the cowboy boots, the blouse with the heels that
   sold, or a tank top with the theme's starfish. */
async function matchSlide(jpegs: Buffer[], titles: string[]): Promise<number[][]> {
  if (jpegs.length < 2) return titles.map(() => jpegs.map((_, i) => i));
  const small = await Promise.all(jpegs.map((j) => sharp(j).resize(768, 768, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer()));
  const map = await assignPhotos(small, titles);
  return map.map((m) => pickPhotos(m, jpegs.length, MAX_PHOTOS_PER_ITEM));
}

/* an imported item, waiting for review under the listserv account. Once an
   admin approves it, signed-in viewers see the contact details the seller's
   own post gave (contact_public). A deck the seller pasted themselves
   (`owner`) makes their own drafts instead, with their profile's contact
   details and the usual rule: shown to a buyer whose offer they accept. */
function listingRow(draft: ImportDraft, paths: string[], sourceId: string, contact: SaleContact, payments: Payment[], owner?: User): Row {
  const own = owner
    ? { seller_netid: owner.netid, contact_email: owner.email, contact_phone: owner.phone, pickup: "", contact_public: false, payments: sql().json(owner.payments as never) }
    : { seller_netid: IMPORT_ACCOUNT, contact_email: contact.email, contact_phone: contact.phone, pickup: contact.pickup, contact_public: true, payments: sql().json(payments as never) };
  return {
    status: "review",
    title: draft.title,
    description: draft.description,
    price_cents: draft.priceCents,
    section: draft.section,
    sub: draft.sub,
    dept: draft.dept,
    brand: draft.brand,
    condition: draft.condition,
    occasion: "none",
    sizing: sql().json(draft.size.sizing as never),
    size: draft.size.size,
    size_facet: draft.size.sizeFacet,
    try_on: APPAREL.has(draft.section) && contact.tryOn,
    photo_paths: sql().array(paths),
    ...own,
    import_source_id: sourceId,
    import_slide: draft.slide,
  };
}

/* Princeton's residential building names, fetched once per server (the map pins by them) */
let dormNames: Promise<string[]> | null = null;
function residentialNames(): Promise<string[]> {
  dormNames ??= fetchResidentialBuildings()
    .then((b) => b.map((x) => x.name))
    .catch((e) => {
      dormNames = null; // try again next time
      throw e;
    });
  return dormNames;
}

/* a building name the map can pin (what a seller picks when they join) */
export async function isResidentialBuilding(name: string): Promise<boolean> {
  return (await residentialNames()).includes(name);
}

/* the sale's contact details, the seller's instructions, and the building its
   pickup spot names (what puts it on the map before the seller joins) */
const contactColumns = async (c: SaleContact, notes: string[]) => ({
  contact_phone: c.phone,
  contact_email: c.email || null,
  pickup: c.pickup || null,
  try_on: c.tryOn,
  seller_notes: sql().array(notes),
  building: c.pickup ? buildingFromText(c.pickup, await residentialNames()) : null,
  contact_checked_at: new Date().toISOString(),
});

/* fn over items, at most `limit` at once, results in order */
async function inPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/* failed, or "pending" so long that the read was cut off */
const isRetryable = (r: Row) =>
  r.status === "failed" || (r.status === "pending" && Date.now() - new Date(r.created_at as string).getTime() > STALE_PENDING_MS);

/* ---- one deck ---- */

export async function importDeck(deckId: string, email: EmailMeta, owner?: User): Promise<DeckResult> {
  const [existing] = await step("find deck", () => sql()<Row[]>`select id, status, author_email, created_at from import_sources where deck_id = ${deckId}`);
  if (existing && !isRetryable(existing)) {
    // first seen in a digest (no author); this email names who posted it, so they can claim it
    if (!existing.author_email && email.authorEmail) {
      const credit = { author_name: email.authorName, author_email: email.authorEmail.toLowerCase(), subject: email.subject, message_id: email.messageId, sent_at: email.sentAt };
      await step("credit deck author", () => sql()`update import_sources set ${sql()(credit)} where id = ${existing.id as string}`);
      return { deckId, status: "skipped", detail: "already imported; credited to its author", created: 0 };
    }
    return { deckId, status: "skipped", detail: "already imported", created: 0 };
  }
  if (existing) await step("clear failed attempt", () => sql()`delete from import_sources where id = ${existing.id as string}`);

  const record = {
    deck_id: deckId,
    deck_url: deckUrl(deckId),
    message_id: email.messageId,
    subject: email.subject,
    listserv: email.listserv,
    author_name: email.authorName,
    author_email: email.authorEmail?.toLowerCase() ?? null,
    sent_at: email.sentAt,
    submitted_by: owner?.netid ?? null,
  };
  const [source] = await step("record deck", () => sql()<Row[]>`insert into import_sources ${sql()(record)} returning id`);
  const uploaded: string[] = [];
  try {
    const [pdf, pptx] = await Promise.all([fetchExport(deckId, "pdf", "application/pdf"), fetchExport(deckId, "pptx", "application/vnd.openxmlformats")]);
    if (pdf.byteLength > MAX_PDF_BYTES) throw new Error(`the deck is ${Math.round(pdf.byteLength / 1e6)} MB as a PDF, too big to be a sale deck`);
    const photos = withoutTemplateArt(photosBySlide(pptx));
    const deck = await extractDeck(pdf, email);
    const contact = cleanContact(deck.contact, email.authorEmail);
    const payments = paymentsFrom(deck.payments);

    const skipped: Record<string, number> = {};
    const skip = (reason: string, n = 1) => (skipped[reason] = (skipped[reason] ?? 0) + n);
    const bySlide = new Map<number, ImportDraft[]>();
    for (const item of deck.items) {
      const d = toDraft(item);
      if (!d.ok) skip(d.reason);
      else bySlide.set(d.draft.slide, [...(bySlide.get(d.draft.slide) ?? []), d.draft]);
    }
    // photos ready and matched, 6 slides at a time (a 98-slide deck is 98 matches)
    const matched = await inPool([...bySlide], 6, async ([slide, drafts]) => {
      const jpegs: Buffer[] = [];
      for (const p of (photos[slide - 1] ?? []).slice(0, MAX_PHOTOS_PER_SLIDE)) {
        const jpeg = await prepare(p.bytes);
        if (jpeg) jpegs.push(jpeg);
      }
      return { slide, drafts, jpegs, sets: jpegs.length ? await matchSlide(jpegs, drafts.map((d) => d.title)) : [] };
    });
    const rows: Row[] = [];
    for (const { slide, drafts, jpegs, sets } of matched) {
      if (!jpegs.length) {
        skip("no photo on the slide", drafts.length);
        continue;
      }
      const pathOf = new Map<number, string>(); // photo index → uploaded path (only photos some item uses)
      for (const [i, draft] of drafts.entries()) {
        if (!sets[i].length) {
          skip("no photo of it on the slide");
          continue;
        }
        for (const n of sets[i]) {
          if (pathOf.has(n)) continue;
          const path = `imports/${deckId}/${slide}-${randomUUID().slice(0, 8)}.jpg`;
          await uploadJpeg(path, jpegs[n]);
          uploaded.push(path);
          pathOf.set(n, path);
        }
        rows.push(listingRow(draft, sets[i].map((n) => pathOf.get(n)!), source.id as string, contact, payments, owner));
      }
    }
    if (rows.length) await step("create listings", () => sql()`insert into listings ${sql()(rows)}`);
    const why = Object.entries(skipped).map(([r, n]) => `${n} ${r}`).join(", ");
    const finish = { status: "done", slides: photos.length, items_found: rows.length, error: why || null, ...(await contactColumns(contact, cleanNotes(deck.seller_notes))) };
    await step("finish deck", () => sql()`update import_sources set ${sql()(finish)} where id = ${source.id as string}`);
    return { deckId, sourceId: source.id as string, status: "imported", detail: `${rows.length} for review${why ? ` (skipped ${why})` : ""}`, created: rows.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (uploaded.length) await remove(PHOTO_BUCKET, uploaded).catch(() => {});
    await sql()`update import_sources set status = 'failed', error = ${message} where id = ${source.id as string}`;
    return { deckId, sourceId: source.id as string, status: "failed", detail: message, created: 0 };
  }
}

/* ---- a seller's own deck, pasted on the sell page ---- */

/* Read a deck the seller pasted into their own drafts, ready for them to check
   and post. A deck already here goes to its page if it's theirs (pasted
   before, or imported from their listserv email, which they can claim). */
export async function importOwnDeck(deckId: string, user: User): Promise<{ sourceId: string } | { error: string }> {
  const [existing] = await step("find deck", () => sql()<Row[]>`
    select id, status, submitted_by, author_email, created_at from import_sources where deck_id = ${deckId}`);
  if (existing && existing.status === "pending" && !isRetryable(existing)) {
    return { error: "That deck is being read right now. Give it a minute, then paste it again." };
  }
  if (existing && !isRetryable(existing)) {
    const theirs = existing.submitted_by === user.netid || netidFromEmail(existing.author_email as string | null) === user.netid;
    return theirs ? { sourceId: existing.id as string } : { error: "That deck is already on TigerRetail, under someone else's name." };
  }
  const r = await importDeck(
    deckId,
    { messageId: null, subject: "", text: "", listserv: null, authorName: user.displayName, authorEmail: user.email, sentAt: null },
    user,
  );
  // nothing to keep or retry: they see why, and can paste it again
  const forget = async () => {
    if (r.sourceId) await step("clear deck", () => sql()`delete from import_sources where id = ${r.sourceId!}`);
  };
  if (r.status === "failed") {
    await forget();
    return {
      error: /shared publicly/.test(r.detail)
        ? "That deck isn't shared publicly. In Google Slides, click Share, set General access to “Anyone with the link”, and try again."
        : `Couldn't read that deck: ${r.detail}`,
    };
  }
  if (!r.created) {
    await forget();
    return { error: `Claude didn't find anything to post in that deck${r.detail.includes("skipped") ? ` (${r.detail.replace(/^0 for review \(skipped (.*)\)$/, "skipped $1")})` : ""}.` };
  }
  return { sourceId: r.sourceId! };
}

/* ---- a sale written in the email itself ---- */

interface EngineSummary {
  id: string;
  subject: string;
  sender: string;
  senderEmail: string;
  sentAt: string;
  listservs: string[];
}
interface EngineMessage extends EngineSummary {
  body: string;
  links: string[];
  media: { kind: string; url: string }[];
  url: string | null;
}

/* a photo linked from the email (imgur, discord…), or null if it can't be had:
   expired, private (listserv attachments need a Princeton sign-in), not an image */
async function fetchPhoto(url: string): Promise<Buffer | null> {
  if (!fetchablePhotoUrl(url)) return null;
  try {
    // every redirect hop is vetted too
    const res = await download(url, { maxBytes: MAX_PHOTO_BYTES, timeoutMs: 20_000, allow: fetchablePhotoUrl });
    if (res.status !== 200 || !res.type.startsWith("image/")) return null;
    return await prepare(res.bytes);
  } catch (e) {
    console.error(`[import] couldn't fetch photo ${url}: ${e}`);
    return null;
  }
}

/* An email selling items in its body, with photos attached. Read once:
   emails that turn out not to be sales are recorded too, so they're never
   paid for twice. */
export async function importEmailSale(m: EngineMessage, photoUrls: string[]): Promise<EmailSaleResult> {
  const [existing] = await step("find email", () => sql()<Row[]>`select id, status from import_sources where kind = 'email' and message_id = ${m.id}`);
  if (existing && existing.status !== "failed") return { messageId: m.id, status: "skipped", detail: "already read", created: 0 };
  if (existing) await step("clear failed attempt", () => sql()`delete from import_sources where id = ${existing.id as string}`);

  const author = saleAuthor(m.sender, m.senderEmail);
  const record = {
    kind: "email",
    message_id: m.id,
    email_url: m.url,
    subject: m.subject,
    listserv: m.listservs?.[0] ?? null,
    author_name: author.name,
    author_email: author.email,
    sent_at: m.sentAt,
  };
  const [source] = await step("record email", () => sql()<Row[]>`insert into import_sources ${sql()(record)} returning id`);
  const finish = async (found: number, why: string | null, contact?: SaleContact, notes: string[] = []) => {
    const patch = { status: "done", slides: null, items_found: found, error: why, ...(contact ? await contactColumns(contact, notes) : {}) };
    await step("finish email", () => sql()`update import_sources set ${sql()(patch)} where id = ${source.id as string}`);
  };
  const uploaded: string[] = [];
  try {
    const photos = (await Promise.all(photoUrls.map(fetchPhoto))).filter((p): p is Buffer => !!p);
    if (!photos.length) {
      await finish(0, "no photo could be downloaded");
      return { messageId: m.id, status: "skipped", detail: "no photo could be downloaded", created: 0 };
    }
    // the model sees smaller copies; listings keep the full ones
    const small = await Promise.all(photos.map((p) => sharp(p).resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer()));
    const sale = await extractEmailSale(small, { subject: m.subject, text: m.body ?? "" });
    const contact = cleanContact(sale.contact, author.email);
    const payments = paymentsFrom(sale.payments);

    const skipped: Record<string, number> = {};
    const pathOf = new Map<number, string>(); // photo number → uploaded path (shared by items it shows)
    const rows: Row[] = [];
    for (const [i, item] of sale.items.entries()) {
      const d = toDraft({ ...item, slide: i + 1 });
      if (!d.ok) {
        skipped[d.reason] = (skipped[d.reason] ?? 0) + 1;
        continue;
      }
      const nums = pickPhotos(item.photos, photos.length, MAX_PHOTOS_PER_ITEM).map((i) => i + 1);
      if (!nums.length) {
        skipped["no photo"] = (skipped["no photo"] ?? 0) + 1;
        continue;
      }
      for (const n of nums) {
        if (pathOf.has(n)) continue;
        const path = `imports/email-${m.id}/${n}-${randomUUID().slice(0, 8)}.jpg`;
        await uploadJpeg(path, photos[n - 1]);
        uploaded.push(path);
        pathOf.set(n, path);
      }
      rows.push(listingRow(d.draft, nums.map((n) => pathOf.get(n)!), source.id as string, contact, payments));
    }
    if (rows.length) await step("create listings", () => sql()`insert into listings ${sql()(rows)}`);
    const why = sale.items.length ? Object.entries(skipped).map(([r, n]) => `${n} ${r}`).join(", ") : "not selling items";
    await finish(rows.length, why || null, contact, cleanNotes(sale.seller_notes));
    return { messageId: m.id, status: "imported", detail: `${rows.length} for review${why ? ` (skipped ${why})` : ""}`, created: rows.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (uploaded.length) await remove(PHOTO_BUCKET, uploaded).catch(() => {});
    await sql()`update import_sources set status = 'failed', error = ${message} where id = ${source.id as string}`;
    return { messageId: m.id, status: "failed", detail: message, created: 0 };
  }
}

/* ---- contact details for sales read before we kept them ---- */

/* Claude reads each such sale's own words (the email, or its digest entry,
   plus the slides' text: no photos, so it's cheap) for how to reach the
   seller, and the sale's unclaimed listings get them. A sale that fails is
   left unmarked, so the next backfill tries it again. */
export async function backfillContacts(): Promise<{ sale: string; detail: string }[]> {
  const get = engine();
  const sources = await step("load sales without contact details", () => sql()<Row[]>`
    select id, kind, deck_id, message_id, subject, author_email from import_sources where status = 'done' and contact_checked_at is null`);
  const out: { sale: string; detail: string }[] = [];
  for (const s of sources) {
    const sale = (s.subject as string | null) ?? (s.deck_id as string | null) ?? (s.id as string);
    try {
      const parts = [`subject: ${sale}`];
      if (s.message_id) {
        const m = await get<EngineMessage>(`/v1/messages/${s.message_id}`);
        const entry = !m.senderEmail && s.deck_id ? digestContact(m.body ?? "", s.deck_id as string) : null;
        parts.push(entry?.text ?? m.body ?? "");
      }
      if (s.kind === "deck" && s.deck_id) {
        const pptx = await fetchExport(s.deck_id as string, "pptx", "application/vnd.openxmlformats");
        parts.push(...slideTexts(pptx).map((t, i) => (t ? `slide ${i + 1}:\n${t.slice(0, 400)}` : "")).filter(Boolean));
      }
      const read = await extractContact(parts.join("\n\n"));
      const contact = cleanContact(read.contact, s.author_email as string | null);
      // keep the methods read with the items unless the post names some
      const payments = read.payments.length ? { payments: sql().json(paymentsFrom(read.payments) as never) } : {};
      const fill = { contact_phone: contact.phone, contact_email: contact.email, pickup: contact.pickup, contact_public: true, ...payments };
      await step("fill in contact details", () => sql()`
        update listings set ${sql()(fill)} where import_source_id = ${s.id as string} and seller_netid = ${IMPORT_ACCOUNT}`);
      await step("fill in try-ons", () => sql()`
        update listings set try_on = ${contact.tryOn}
        where import_source_id = ${s.id as string} and seller_netid = ${IMPORT_ACCOUNT} and section in ${sql()([...APPAREL])}`);
      const notes = cleanNotes(read.seller_notes);
      const cols = await contactColumns(contact, notes);
      await step("record contact details", () => sql()`update import_sources set ${sql()(cols)} where id = ${s.id as string}`);
      out.push({
        sale,
        detail: [contact.phone ? "phone" : null, contact.email ? "email" : null, contact.pickup ? "pickup" : null, contact.tryOn ? "try-ons" : null, read.payments.length ? "payments" : null, notes.length ? `${notes.length} notes` : null]
          .filter(Boolean)
          .join(", ") || "nothing stated",
      });
    } catch (e) {
      out.push({ sale, detail: `failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return out;
}

/* ---- photos for decks imported before we matched them ---- */

/* Items imported before photo matching got their slide's first few images:
   another item's photo, a sold item's, or the theme's decorations. This
   pulls each deck from Google again and gives every unclaimed item the photos
   Claude matches to it, the same way a new import does. An item nothing
   matches keeps what it had; photos no listing uses anymore are deleted. */
export async function rematchPhotos(): Promise<{ sale: string; slides: number; changed: number; unmatched: number; detail?: string }[]> {
  const sources = await step("load decks", () => sql()<Row[]>`select id, subject, deck_id from import_sources where kind = 'deck' and status = 'done'`);
  const out = [];
  for (const s of sources) {
    const deckId = s.deck_id as string;
    const sale = (s.subject as string | null) || deckId;
    const rows = await step("load sale", () => sql()<Row[]>`
      select id, title, import_slide, photo_paths from listings where import_source_id = ${s.id as string} and seller_netid = ${IMPORT_ACCOUNT}`);
    const bySlide = new Map<number, Row[]>();
    for (const r of rows) bySlide.set(r.import_slide as number, [...(bySlide.get(r.import_slide as number) ?? []), r]);
    let slides = 0, changed = 0, unmatched = 0;
    const replaced = new Set<string>();
    try {
      const photos = withoutTemplateArt(photosBySlide(await fetchExport(deckId, "pptx", "application/vnd.openxmlformats")));
      for (const [slide, group] of bySlide) {
        const jpegs: Buffer[] = [];
        for (const p of (photos[slide - 1] ?? []).slice(0, MAX_PHOTOS_PER_SLIDE)) {
          const jpeg = await prepare(p.bytes);
          if (jpeg) jpegs.push(jpeg);
        }
        if (jpegs.length < 2) continue; // nothing to choose between
        slides++;
        const sets = await matchSlide(jpegs, group.map((r) => r.title as string));
        const pathOf = new Map<number, string>();
        for (const [i, r] of group.entries()) {
          if (!sets[i].length) {
            unmatched++;
            continue;
          }
          for (const n of sets[i]) {
            if (pathOf.has(n)) continue;
            const path = `imports/${deckId}/${slide}-${randomUUID().slice(0, 8)}.jpg`;
            await uploadJpeg(path, jpegs[n]);
            pathOf.set(n, path);
          }
          const paths = sets[i].map((n) => pathOf.get(n)!);
          await step("rematch photos", () => sql()`update listings set photo_paths = ${sql().array(paths)} where id = ${r.id as string}`);
          for (const p of r.photo_paths as string[]) replaced.add(p);
          changed++;
        }
      }
      // old photos nothing points at anymore
      const old = [...replaced];
      if (old.length) {
        const still = await step("check old photos", () => sql()<Row[]>`select photo_paths from listings where photo_paths && ${sql().array(old)}`);
        const keep = new Set(still.flatMap((r) => r.photo_paths as string[]));
        const gone = old.filter((p) => !keep.has(p));
        if (gone.length) await step("delete old photos", () => remove(PHOTO_BUCKET, gone));
      }
      out.push({ sale, slides, changed, unmatched });
    } catch (e) {
      // listings updated so far point at their new photos; ones not reached keep their old ones
      out.push({ sale, slides, changed, unmatched, detail: `stopped: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return out;
}

/* ---- map pins for sales read before we placed them ---- */

/* Sales whose pickup spot names a building get that building. No Claude:
   the pickup text was already read; this only matches it to the map's names. */
export async function placeSales(): Promise<{ sales: number; placed: number }> {
  const names = await residentialNames();
  const rows = await step("load sales", () => sql()<Row[]>`select id, pickup from import_sources where status = 'done' and pickup is not null`);
  let placed = 0;
  for (const r of rows) {
    const building = buildingFromText(r.pickup as string, names);
    await step("place sale", () => sql()`update import_sources set building = ${building} where id = ${r.id as string}`);
    if (building) placed++;
  }
  return { sales: rows.length, placed };
}

/* ---- section and department for items imported before Claude judged them ---- */

/* Items read before the extraction judged department and category from the
   item itself often landed in "unisex". Claude looks at each unclaimed item's
   cover photo and words again, with its sale's own words ("selling mens
   clothing"), 15 at a time. A department only gets more specific: the first
   read saw the whole post, so women's or men's never turns into unisex.
   Answers outside the catalog are ignored; the size is re-read only when an
   item moves to another section. */
export async function resortItems(): Promise<{ items: number; moved: number; dept: number; ignored: number }> {
  const get = engine();
  const rows = (
    await step("load imported items", () => sql()<Row[]>`
      select l.id, l.title, l.description, l.section, l.sub, l.dept, l.size, l.photo_paths,
             s.subject, s.message_id, s.deck_id, s.seller_notes
      from listings l join import_sources s on s.id = l.import_source_id
      where l.seller_netid = ${IMPORT_ACCOUNT}
      order by l.import_source_id`)
  ).map((r) => ({ ...r, import_sources: { subject: r.subject, message_id: r.message_id, deck_id: r.deck_id, seller_notes: r.seller_notes } as Row }));
  // each sale's own words: subject, the email or its digest entry, the seller's notes
  const saleText = new Map<string, string>();
  async function wordsOf(src: Row): Promise<string> {
    const key = JSON.stringify([src.message_id, src.deck_id]);
    if (!saleText.has(key)) {
      const parts = [`subject: ${(src.subject as string | null) ?? ""}`, ...((src.seller_notes as string[] | null) ?? [])];
      if (src.message_id) {
        const m = await get<EngineMessage>(`/v1/messages/${src.message_id}`);
        const entry = !m.senderEmail && src.deck_id ? digestContact(m.body ?? "", src.deck_id as string) : null;
        parts.push(entry?.text ?? m.body ?? "");
      }
      // the deck's own words too ("I am 5'6" and wear a M/L" on its title slide)
      if (src.deck_id) {
        const texts = slideTexts(await fetchExport(src.deck_id as string, "pptx", "application/vnd.openxmlformats"));
        parts.push(texts.map((t, i) => (t ? `slide ${i + 1}: ${t.replace(/\n/g, " | ").slice(0, 200)}` : "")).filter(Boolean).join("\n"));
      }
      saleText.set(key, parts.join("\n"));
    }
    return saleText.get(key)!;
  }
  const bySale = new Map<string, Row[]>();
  for (const r of rows) {
    const k = JSON.stringify(r.import_sources);
    bySale.set(k, [...(bySale.get(k) ?? []), r]);
  }
  const batches = [...bySale.values()].flatMap((g) => Array.from({ length: Math.ceil(g.length / 15) }, (_, j) => g.slice(j * 15, j * 15 + 15)));
  let moved = 0, dept = 0, ignored = 0;
  for (const batch of batches) {
    const photos = await Promise.all(
      batch.map(async (r) => {
        const res = await download(photoUrl((r.photo_paths as string[])[0]), { maxBytes: MAX_PHOTO_BYTES, timeoutMs: 30_000 });
        return sharp(res.bytes).resize(384, 384, { fit: "inside" }).jpeg({ quality: 75 }).toBuffer();
      }),
    );
    const answers = await sortItems(
      batch.map((r, k) => ({ photo: photos[k], title: r.title as string, description: r.description as string })),
      await wordsOf(batch[0].import_sources as Row),
    );
    for (const [k, r] of batch.entries()) {
      const a = answers[k];
      if (!a?.section || !isSection(a.section) || !a.sub || !subsOf(a.section).includes(a.sub)) {
        ignored++;
        continue;
      }
      const judged: ListingDept = !APPAREL.has(a.section) ? "misc" : a.dept === "women's" || a.dept === "men's" ? a.dept : "unisex";
      // more specific only: never women's/men's → unisex
      const d: ListingDept = judged === "unisex" && (r.dept === "women's" || r.dept === "men's") ? (r.dept as ListingDept) : judged;
      const sectionChanged = a.section !== r.section || a.sub !== r.sub;
      if (!sectionChanged && d === r.dept) continue;
      const patch: Row = { section: a.section, sub: a.sub, dept: d };
      if (sectionChanged) {
        const z = parseSizeText(r.size as string, a.section, a.sub, d);
        Object.assign(patch, { sizing: sql().json(z.sizing as never), size: z.size, size_facet: z.sizeFacet });
        if (!APPAREL.has(a.section)) patch.try_on = false;
        moved++;
      }
      if (d !== r.dept) dept++;
      await step("re-sort item", () => sql()`update listings set ${sql()(patch)} where id = ${r.id as string}`);
    }
  }
  return { items: rows.length, moved, dept, ignored };
}

/* ---- the scheduled run: InboxEngine → decks and email sales ---- */

function engine() {
  const base = process.env.INBOX_ENGINE_URL;
  const token = process.env.INBOX_ENGINE_TOKEN;
  if (!base || !token) {
    throw new Error("INBOX_ENGINE_URL / INBOX_ENGINE_TOKEN aren't set, so the listserv can't be searched. Ask TigerApps for an InboxEngine token.");
  }
  return async <T>(path: string, params: Record<string, string> = {}): Promise<T> => {
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) throw new Error(`InboxEngine ${url.pathname} returned ${res.status}`);
    return (await res.json()) as T;
  };
}

export interface RunResult {
  since: string;
  emails: number;
  decks: DeckResult[];
  emailSales: EmailSaleResult[];
}

/* First run: the last 30 days. After that: from the last successful run.
   `days` rescans further back (decks already read are skipped, not re-read). */
export async function runListservImport(opts: { days?: number } = {}): Promise<RunResult> {
  const get = engine(); // fail fast, before recording a run, if not configured
  const [last] = await step("load last run", () => sql()<Row[]>`select started_at from import_runs where ok = true order by started_at desc limit 1`);
  const days = opts.days ?? (last ? null : FIRST_RUN_DAYS);
  const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : (last!.started_at as string);
  const [run] = await step("record run", () => sql()<Row[]>`insert into import_runs (since) values (${since}) returning id`);

  try {
    const summaries: EngineSummary[] = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const page = await get<{ total: number; results: EngineSummary[] }>("/v1/messages", {
        q: SALE_QUERY,
        listserv: "residential",
        from: since,
        sort: "oldest",
        limit: "100",
        offset: String(offset),
      });
      summaries.push(...page.results);
      if (summaries.length >= page.total || page.results.length < 100) break;
    }
    const decks: DeckResult[] = [];
    // decks that failed last time (Google hiccup, no API key yet) get another go
    // a seller's own pasted deck isn't retried here: they saw why it failed
    const failed = await step("load failed sales", () => sql()<Row[]>`
      select kind, deck_id, message_id, subject, listserv, author_name, author_email, sent_at
      from import_sources where status = 'failed' and submitted_by is null`);
    const emailSales: EmailSaleResult[] = [];
    const retryEmails = new Set<string>();
    for (const f of failed) {
      if (f.kind === "email") {
        retryEmails.add(f.message_id as string);
        continue;
      }
      decks.push(
        await importDeck(f.deck_id as string, {
          messageId: f.message_id as string | null,
          subject: (f.subject as string) ?? "",
          text: "",
          listserv: f.listserv as string | null,
          authorName: f.author_name as string | null,
          authorEmail: f.author_email as string | null,
          sentAt: f.sent_at as string | null,
        }),
      );
    }
    // failed email sales are fetched again (unless this run sees them anyway)
    const ids = [...summaries.map((s) => s.id), ...[...retryEmails].filter((id) => !summaries.some((s) => s.id === id))];
    for (const id of ids) {
      const m = await get<EngineMessage>(`/v1/messages/${id}`);
      const sender = saleAuthor(m.sender, m.senderEmail);
      // links people paste as bare text aren't in InboxEngine's links list
      for (const deckId of deckIdsIn([...(m.links ?? []), ...linksIn(m.body)])) {
        // already failed in this run (a private deck): fetching it again won't help
        if (decks.some((d) => d.deckId === deckId && d.status === "failed")) continue;
        // a digest relays someone else's post: its entry names them, and is the text to read
        const entry = sender.email ? null : digestContact(m.body ?? "", deckId);
        decks.push(
          await importDeck(deckId, {
            messageId: m.id,
            subject: m.subject,
            text: entry?.text ?? m.body ?? "",
            listserv: m.listservs?.[0] ?? null,
            authorName: entry?.name ?? sender.name,
            authorEmail: entry?.email ?? sender.email,
            sentAt: m.sentAt,
          }),
        );
      }
      // no slides: maybe the items are in the email itself
      const body = bodySaleCandidate(m);
      if (body.ok) emailSales.push(await importEmailSale(m, body.photos));
    }
    const created = [...decks, ...emailSales].reduce((n, d) => n + d.created, 0);
    const failedNow = [...decks, ...emailSales].filter((d) => d.status === "failed").length;
    const read = emailSales.filter((e) => e.status !== "skipped" || e.detail !== "already read").length;
    const summary = `${summaries.length} emails, ${decks.length} decks, ${read} email sales, ${created} items for review, ${failedNow} failed`;
    await step("finish run", () => sql()`update import_runs set finished_at = now(), ok = true, summary = ${summary} where id = ${run.id as string}`);
    return { since, emails: summaries.length, decks, emailSales };
  } catch (e) {
    await sql()`update import_runs set finished_at = now(), ok = false, summary = ${e instanceof Error ? e.message : String(e)} where id = ${run.id as string}`;
    throw e;
  }
}
