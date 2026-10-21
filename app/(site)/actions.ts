"use server";
/* Every mutation in the skeleton. Each one re-reads the session itself:
   a Server Action is a public POST endpoint, so the page that rendered the
   button proves nothing about who is calling it. */
import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { safeNext } from "@/lib/cas";
import { getViewer, requireUser } from "@/lib/auth";
import * as data from "@/lib/data";
import { claim, isAdmin, publishOwn, takeDown } from "@/lib/importer/admin";
import { isResidentialBuilding, startOwnDeck } from "@/lib/importer/importer";
import { deckIdsIn, linksIn } from "@/lib/importer/rules";
import { isBlankItem, parseContact, parseDollars, parseItem, parseProfile, type ContactChoice, type ItemDraft, type ItemInput } from "@/lib/rules";
import type { CardListing } from "./_components/ListingCard";

export type FormState = { errors?: Record<string, string>; values?: Record<string, string | string[]> } | undefined;

const echo = (f: FormData): Record<string, string | string[]> => {
  const out: Record<string, string | string[]> = {};
  for (const k of new Set(f.keys())) {
    const all = f.getAll(k).filter((v): v is string => typeof v === "string");
    out[k] = all.length > 1 || k === "pay" ? all : (all[0] ?? "");
  }
  return out;
};

export async function saveProfileAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser("/profile", { onboarded: false });
  const parsed = parseProfile(f);
  if (!parsed.ok) return { errors: parsed.errors, values: echo(f) };
  await data.saveProfile(user.netid, parsed.value);
  revalidatePath("/", "layout");
  redirect(safeNext(f.get("next") as string | null));
}

/* Profile photo: changes save immediately, separate from the profile form. */
export async function setAvatarAction(f: FormData): Promise<{ error?: string }> {
  const user = await requireUser("/profile");
  const photo = f.get("photo");
  const remove = f.get("remove") === "1";
  if (!remove && !(photo instanceof File && photo.size > 0)) return { error: "Pick a photo first." };
  try {
    await data.setAvatar(user.netid, remove ? null : (photo as File));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/", "layout");
  return {};
}

export type PublishResult =
  | { ok: true; listings: CardListing[] }
  | { ok: false; contactErrors?: Record<string, string>; itemErrors?: Record<number, Record<string, string>>; form?: string };

/* Sell flow: step 1's contact + step 2's item cards, published together.
   Fields: contact (JSON), items (JSON, blank cards already dropped by the
   page but re-checked here), photos:<i> (files, in cover-first order). */
export async function publishBatchAction(f: FormData): Promise<PublishResult> {
  const user = await requireUser("/sell");
  let contact: ContactChoice;
  let drafts: ItemDraft[];
  try {
    contact = JSON.parse(String(f.get("contact")));
    drafts = JSON.parse(String(f.get("items")));
    if (!Array.isArray(drafts)) throw new Error("items is not a list");
  } catch (e) {
    return { ok: false, form: `The form arrived garbled (${e instanceof Error ? e.message : e}). Reload and try again.` };
  }

  const c = parseContact(contact, { email: user.email, phone: user.phone });
  const itemErrors: Record<number, Record<string, string>> = {};
  const items: { input: ItemInput; photos: File[] }[] = [];
  drafts.forEach((d, i) => {
    const photos = f.getAll(`photos:${i}`).filter((x): x is File => x instanceof File);
    if (isBlankItem({ ...d, photoCount: photos.length })) return;
    const r = parseItem({ ...d, photoCount: photos.length });
    if (r.ok) items.push({ input: r.value, photos });
    else itemErrors[i] = r.errors;
  });
  if (!c.ok || Object.keys(itemErrors).length) return { ok: false, contactErrors: c.ok ? undefined : c.errors, itemErrors };
  if (items.length === 0) return { ok: false, form: "Give at least one item a name, a price above $0 and a photo." };

  let ids: string[];
  try {
    ids = await data.createBatch(user.netid, c.value, items);
  } catch (e) {
    return { ok: false, form: `Publishing failed, nothing was posted: ${e instanceof Error ? e.message : e}` };
  }
  await data.saveDefaultPayments(user.netid, c.value.payments);
  revalidatePath("/", "layout");
  const published = await Promise.all(ids.map((id) => data.getListing(id)));
  return { ok: true, listings: published.filter((l): l is NonNullable<typeof l> => l !== null) };
}

/* Edit a listing: the seller, or an admin fixing an unclaimed import. */
export type EditResult = { ok: true } | { ok: false; errors?: Record<string, string>; form?: string };
export async function updateListingAction(f: FormData): Promise<EditResult> {
  const id = String(f.get("listingId") ?? "");
  const user = await requireUser(`/listings/${id}/edit`, { onboarded: false });
  const listing = await data.getListing(id);
  if (!listing || !data.canEditListing(listing, user.netid, isAdmin(user.netid))) return { ok: false, form: "You can't edit this listing." };
  let draft: ItemDraft;
  let order: ({ path: string } | { new: number })[];
  try {
    draft = JSON.parse(String(f.get("item")));
    order = JSON.parse(String(f.get("order")));
    if (!Array.isArray(order)) throw new Error("order is not a list");
  } catch (e) {
    return { ok: false, form: `The form arrived garbled (${e instanceof Error ? e.message : e}). Reload and try again.` };
  }
  const files = f.getAll("new").filter((x): x is File => x instanceof File);
  const photos = order.map((o) => ("path" in o ? { path: String(o.path) } : { file: files[o.new] }));
  if (photos.some((p) => "file" in p && !p.file)) return { ok: false, form: "A new photo went missing on the way. Try again." };
  const sizingChanged = f.get("sizingChanged") === "1";
  const r = parseItem(
    { ...draft, photoCount: photos.length },
    {
      allowNotStated: true,
      // a size the seller didn't touch stays as stored (imports have ones the picker can't make)
      keepSize: sizingChanged ? undefined : { sizing: listing.sizing, size: listing.size, sizeFacet: listing.sizeFacet },
    },
  );
  if (!r.ok) return { ok: false, errors: r.errors };
  try {
    await data.updateListing(id, r.value, photos as ({ path: string } | { file: File })[]);
  } catch (e) {
    return { ok: false, form: `Couldn't save: ${e instanceof Error ? e.message : e}` };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function makeOfferAction(_: FormState, f: FormData): Promise<FormState> {
  const listingId = String(f.get("listingId") ?? "");
  const user = await requireUser(`/listings/${listingId}`);
  const amount = parseDollars(String(f.get("amount") ?? ""));
  const message = String(f.get("message") ?? "").trim().slice(0, 500);
  if (amount === null) return { errors: { amount: "Enter an amount like 20 or 20.50." }, values: echo(f) };
  try {
    await data.makeOffer(listingId, user.netid, amount, message);
  } catch (e) {
    return { errors: { form: e instanceof Error ? e.message : String(e) }, values: echo(f) };
  }
  revalidatePath(`/listings/${listingId}`);
  revalidatePath("/me");
  return {};
}

export async function respondToOfferAction(f: FormData) {
  const offerId = String(f.get("offerId") ?? "");
  const user = await requireUser("/me");
  const listingId = await data.respondToOffer(offerId, user.netid, f.get("decision") === "accept");
  revalidatePath(`/listings/${listingId}`);
  revalidatePath("/me");
}

export async function markSoldAction(f: FormData) {
  const listingId = String(f.get("listingId") ?? "");
  const user = await requireUser(`/listings/${listingId}`);
  await data.markSold(listingId, user.netid);
  revalidatePath("/", "layout");
}

/* ---- messaging ---- */

/* "message seller" (buyer) or "message" on an offer (seller, with ?buyer=). */
export async function startConversationAction(f: FormData) {
  const listingId = String(f.get("listingId") ?? "");
  const withBuyer = f.get("buyer") ? String(f.get("buyer")) : null;
  const user = await requireUser(`/listings/${listingId}`);
  const id = await data.startConversation(listingId, user.netid, withBuyer);
  redirect(`/messages/${id}`);
}

export async function sendMessageAction(conversationId: string, body: string): Promise<{ message?: data.Message; error?: string }> {
  const user = await requireUser(`/messages/${conversationId}`);
  try {
    return { message: await data.sendMessage(conversationId, user.netid, body) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/* the open thread asks for anything newer every few seconds */
export async function pollMessagesAction(conversationId: string, afterIso: string | null): Promise<data.Message[]> {
  const user = await requireUser(`/messages/${conversationId}`);
  return data.messagesSince(conversationId, user.netid, afterIso);
}

export async function unreadCountAction(): Promise<number> {
  const viewer = await getViewer();
  return viewer ? data.unreadCount(viewer.netid) : 0;
}

/* "this is my sale": the listings imported from it move to the seller's account */
export async function claimImportAction(f: FormData) {
  const sourceId = String(f.get("sourceId") ?? "");
  const back = String(f.get("back") ?? "/me");
  const user = await requireUser(back, { onboarded: false });
  const building = String(f.get("building") ?? "").trim();
  // only names the map can pin (the picker offers nothing else; a forged one is refused)
  if (building && !(await isResidentialBuilding(building))) throw new Error("Pick your dorm from the list.");
  await claim(sourceId, user, building || undefined);
  revalidatePath("/", "layout");
  redirect(safeNext(back));
}

/* "have your sale in Google Slides?": read the seller's deck into their own
   drafts, then send them to check and post it */
export type DeckState = { error?: string } | undefined;
export async function importOwnDeckAction(_: DeckState, f: FormData): Promise<DeckState> {
  const user = await requireUser("/sell");
  const text = String(f.get("url") ?? "").trim();
  const [deckId] = deckIdsIn([text, ...linksIn(text)]);
  if (!deckId) return { error: "That isn't a Google Slides link. It looks like docs.google.com/presentation/d/…" };
  const r = await startOwnDeck(deckId, user);
  if ("error" in r) return { error: r.error };
  // reading takes minutes, longer than Cloudflare keeps a request open: the sale
  // page says "reading" and refreshes itself until it's done
  if (r.read) after(r.read);
  revalidatePath("/", "layout");
  redirect(`/welcome/${r.sourceId}`);
}

/* post the drafts the seller kept from their own deck */
export async function publishOwnAction(f: FormData) {
  const sourceId = String(f.get("sourceId") ?? "");
  const user = await requireUser(`/welcome/${sourceId}`);
  await publishOwn(sourceId, user);
  revalidatePath("/", "layout");
}

/* the seller takes items from their imported sale down */
export async function takeDownImportAction(f: FormData) {
  const sourceId = String(f.get("sourceId") ?? "");
  const user = await requireUser(`/welcome/${sourceId}`, { onboarded: false });
  await takeDown(sourceId, f.getAll("id").map(String), user);
  revalidatePath("/", "layout");
}
