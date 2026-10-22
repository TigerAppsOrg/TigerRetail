import "server-only";
/* Review queue and claiming for imported listings. */
import { env } from "../env";
import { sendMail } from "../mail";
import { sql, type Row } from "../db";
import { PHOTO_BUCKET, photoUrl, remove } from "../storage";
import { inviteEmail, inviteRecipient } from "./invite";
import type { User } from "../data";
import { IMPORT_ACCOUNT, netidFromEmail } from "./rules";

async function step<T>(what: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    throw new Error(`${what}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
// ids come from forms: anything that isn't a uuid is nobody's
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuids = (ids: string[]) => ids.filter((i) => UUID.test(i));

/* ADMIN_NETIDS=rp4348,pt1234 */
export const isAdmin = (netid: string | null | undefined) =>
  !!netid && (process.env.ADMIN_NETIDS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(netid);

export interface ImportSource {
  id: string;
  kind: "deck" | "email";
  /* the slides, or the email on TigerInbox (both need a Princeton sign-in at most) */
  originalUrl: string | null;
  subject: string | null;
  listserv: string | null;
  authorName: string | null;
  authorEmail: string | null;
  sentAt: string | null;
  status: string;
  error: string | null;
  itemsFound: number | null;
  createdAt: string;
  invitedAt: string | null;
  invitedTo: string | null;
  sellerNotes: string[]; // the seller's own instructions for the sale
  submittedBy: string | null; // set when the seller pasted their own deck on the sell page
  building: string | null; // the building its pickup spot names, if any (its map pin until the seller joins)
}
export interface QueueItem {
  id: string;
  slide: number | null;
  title: string;
  priceCents: number;
  size: string;
  section: string;
  sub: string;
  condition: string;
  description: string;
  photoUrl: string;
  status: string;
}

const toSource = (r: Row): ImportSource => ({
  id: r.id as string,
  kind: r.kind === "email" ? "email" : "deck",
  originalUrl: ((r.kind === "email" ? r.email_url : r.deck_url) as string | null) ?? null,
  subject: r.subject as string | null,
  listserv: r.listserv as string | null,
  authorName: r.author_name as string | null,
  authorEmail: r.author_email as string | null,
  sentAt: r.sent_at as string | null,
  status: r.status as string,
  error: r.error as string | null,
  itemsFound: r.items_found as number | null,
  createdAt: r.created_at as string,
  invitedAt: (r.invited_at as string | null) ?? null,
  invitedTo: (r.invited_to as string | null) ?? null,
  sellerNotes: (r.seller_notes as string[] | null) ?? [],
  submittedBy: (r.submitted_by as string | null) ?? null,
  building: (r.building as string | null) ?? null,
});

/* Decks newest first, each with the listings still waiting for review. */
export async function reviewQueue(): Promise<{ source: ImportSource; items: QueueItem[] }[]> {
  const sources = await step("load decks", () => sql()<Row[]>`select * from import_sources where dismissed_at is null and submitted_by is null order by created_at desc limit 100`);
  const listings = await step("load review queue", () => sql()<Row[]>`
    select id, import_source_id, import_slide, title, price_cents, size, section, sub, condition, description, photo_paths, status
    from listings where status = 'review' and import_source_id is not null order by import_slide`);
  // emails read and found not to be sales stay recorded (so they aren't read twice), but out of the queue;
  // so do decks sellers pasted themselves (their own drafts, nothing to approve)
  const shown = sources.filter((s) => !(s.kind === "email" && s.status === "done" && !s.items_found) && !s.submitted_by);
  return shown.map((s) => ({
    source: toSource(s),
    items: listings
      .filter((l) => l.import_source_id === s.id)
      .map((l) => ({
        id: l.id as string,
        slide: l.import_slide as number | null,
        title: l.title as string,
        priceCents: l.price_cents as number,
        size: l.size as string,
        section: l.section as string,
        sub: l.sub as string,
        condition: l.condition as string,
        description: l.description as string,
        photoUrl: photoUrl((l.photo_paths as string[])[0]),
        status: l.status as string,
      })),
  }));
}

export async function recentRuns(limit = 5) {
  return step("load runs", () => sql()<Row[]>`select * from import_runs order by started_at desc limit ${limit}`);
}

export async function approve(listingIds: string[]) {
  const ids = uuids(listingIds);
  if (!ids.length) return;
  await step("approve", () => sql()`update listings set status = 'active' where id in ${sql()(ids)} and status = 'review' and import_source_id is not null`);
}

/* Rejected imports are deleted; a photo goes too unless another listing still uses it. */
export async function reject(listingIds: string[]) {
  const ids = uuids(listingIds);
  if (!ids.length) return;
  const rows = await step("load rejected", () => sql()<Row[]>`
    select id, photo_paths from listings where id in ${sql()(ids)} and status = 'review' and import_source_id is not null`);
  await deleteListings(rows);
}

async function deleteListings(rows: Row[]) {
  if (!rows.length) return;
  await step("delete listings", () => sql()`delete from listings where id in ${sql()(rows.map((r) => r.id as string))}`);
  const paths = [...new Set(rows.flatMap((r) => r.photo_paths as string[]))];
  if (!paths.length) return;
  const stillUsed = await step("check photos", () => sql()<Row[]>`select photo_paths from listings where photo_paths && ${sql().array(paths)}`);
  const keep = new Set(stillUsed.flatMap((r) => r.photo_paths as string[]));
  const gone = paths.filter((p) => !keep.has(p));
  if (gone.length) await remove(PHOTO_BUCKET, gone).catch((e) => console.error(`[import] couldn't delete ${gone.length} rejected photos: ${e}`));
}

/* Email the person who posted the sale an invite to join and manage it. In
   test mode (the default) it goes to INVITE_TEST_RECIPIENT, not them. */
export async function sendInvite(sourceId: string, options: { once?: boolean } = {}): Promise<{ to: string; test: boolean; alreadySent?: boolean }> {
  if (!UUID.test(sourceId)) throw new Error("No such sale.");
  // Serialize manual and automatic sends for this sale, including across servers.
  return sql().begin(async (tx) => {
    const [row] = await tx<Row[]>`select * from import_sources where id = ${sourceId} for update`;
    if (!row) throw new Error("No such sale.");
    const source = toSource(row);
    if (!netidFromEmail(source.authorEmail)) throw new Error("This sale has no princeton.edu address to invite.");
    const { to, test } = inviteRecipient(source.authorEmail!, process.env);
    if (options.once && source.invitedAt && source.invitedTo === to) return { to, test, alreadySent: true };
    const items = await tx<Row[]>`select id from listings where import_source_id = ${sourceId} and seller_netid = ${IMPORT_ACCOUNT} and status = 'active'`;
    if (!items.length) throw new Error("There are no approved, unclaimed items from this sale to invite the seller to manage.");
    if (source.invitedAt && Date.now() - new Date(source.invitedAt).getTime() < 60_000) {
      throw new Error("An invite for this sale went out less than a minute ago.");
    }
    const mail = inviteEmail({ name: source.authorName, sale: source.subject ?? "your sale", count: items.length,
      url: `${env.appUrl()}/welcome/${source.id}`, intended: source.authorEmail!, test });
    await sendMail({ to, ...mail, idempotencyKey: `invite/${source.id}/${Math.floor(Date.now() / 60_000)}` });
    await tx`update import_sources set invited_at = now(), invited_to = ${to} where id = ${source.id}`;
    return { to, test };
  });
}

export async function approveSaleAndInvite(sourceId: string): Promise<string> {
  if (!UUID.test(sourceId)) throw new Error("Invalid sale.");
  const [eligible] = await sql()`select id from import_sources where id = ${sourceId} and submitted_by is null and status = 'done'`;
  if (!eligible) throw new Error("This sale is not ready for admin approval.");
  await step("approve sale", () => sql()`update listings set status = 'active'
    where import_source_id = ${sourceId} and status = 'review'
      and exists (select 1 from import_sources where id = ${sourceId} and submitted_by is null and status = 'done')`);
  try {
    const result = await sendInvite(sourceId, { once: true });
    if (result.alreadySent) return "Items approved. An invite was already sent; no duplicate email was sent.";
    return result.test ? `Items approved. Test invite sent to ${result.to} (not the seller).` : `Items approved. Invite sent to ${result.to}.`;
  } catch (e) {
    return `Items approved, but the invite was not sent: ${e instanceof Error ? e.message : String(e)}. Use send invite to retry.`;
  }
}

/* ---- on the listing page ---- */

export async function sourceFor(id: string | null): Promise<ImportSource | null> {
  if (!id || !UUID.test(id)) return null;
  const [r] = await step("load deck", () => sql()<Row[]>`select * from import_sources where id = ${id}`);
  return r ? toSource(r) : null;
}

/* The person whose princeton.edu address is on the email can claim the deck.
   The footer is untrusted text, but claiming requires signing in through CAS
   as that netid, so only they can do it. */
export const canClaim = (source: ImportSource, viewer: string | null | undefined) =>
  !!viewer && netidFromEmail(source.authorEmail) === viewer;

/* whose sale page this is: the poster of a listserv sale, or the seller who pasted the deck */
export const canManage = (source: ImportSource, viewer: string | null | undefined) =>
  !!viewer && (source.submittedBy === viewer || canClaim(source, viewer));

/* A seller's own pasted deck: post the drafts they kept. */
export async function publishOwn(sourceId: string, user: User): Promise<number> {
  const source = await sourceFor(sourceId);
  if (!source || source.submittedBy !== user.netid) throw new Error("Only the seller who added this deck can post it.");
  const rows = await step("post drafts", () => sql()<Row[]>`
    update listings set status = 'active'
    where import_source_id = ${sourceId} and seller_netid = ${user.netid} and status = 'review' returning id`);
  return rows.length;
}

/* Every unclaimed listing from the sale moves to the seller's account, so
   buyers can message them here. Their posted contact details stay on the
   listings (they can change them later); claiming one still in review vouches
   for it. No onboarding needed: one CAS sign-in is the whole ask. */
export async function claim(sourceId: string, user: User, building?: string): Promise<number> {
  const source = await sourceFor(sourceId);
  if (!source || !canClaim(source, user.netid)) throw new Error("Only the person who posted this sale can claim it.");
  const rows = await step("claim", () => sql()<Row[]>`
    update listings set seller_netid = ${user.netid}, status = 'active'
    where import_source_id = ${sourceId} and seller_netid = ${IMPORT_ACCOUNT} and status in ('review', 'active') returning id`);
  // their dorm puts every one of their listings on the map
  if (building) await step("save dorm", () => sql()`update users set building = ${building} where netid = ${user.netid}`);
  // the name their sale went out under, if they haven't set one
  if (!user.displayName && source.authorName) {
    const name = source.authorName.slice(0, 60);
    await step("name from sale", () => sql()`update users set display_name = ${name} where netid = ${user.netid} and display_name is null`);
  }
  return rows.length;
}

/* Everything from one sale, for the seller's welcome page: still unclaimed
   (any status), or already theirs. */
export async function saleListings(sourceId: string, netid: string) {
  const rows = await step("load sale", () => sql()<Row[]>`
    select id, title, price_cents, size, brand, photo_paths, status, seller_netid, import_slide
    from listings where import_source_id = ${sourceId} and seller_netid in (${IMPORT_ACCOUNT}, ${netid}) order by import_slide`);
  return rows.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    priceCents: r.price_cents as number,
    size: r.size as string,
    brand: r.brand as string,
    photoUrls: (r.photo_paths as string[]).map(photoUrl),
    status: r.status as string,
    claimed: r.seller_netid === netid,
  }));
}

/* The seller takes items down: deleted, photos too (unless shared). Only
   items from a sale they posted, unclaimed or already theirs. */
export async function takeDown(sourceId: string, listingIds: string[], user: User): Promise<number> {
  const source = await sourceFor(sourceId);
  if (!source || !canManage(source, user.netid)) throw new Error("Only the person who posted this sale can take its items down.");
  const ids = uuids(listingIds);
  if (!ids.length) return 0;
  const rows = await step("load items to take down", () => sql()<Row[]>`
    select id, photo_paths from listings
    where id in ${sql()(ids)} and import_source_id = ${sourceId} and seller_netid in (${IMPORT_ACCOUNT}, ${user.netid})`);
  await deleteListings(rows);
  return rows.length;
}
