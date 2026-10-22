"use server";
/* Admin-only actions for the listserv import. Each re-checks the session and
   the admin list itself: a Server Action is a public endpoint. */
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { approve, isAdmin, reject, sendInvite } from "@/lib/importer/admin";
import { finishListservRun, readDeck, startDeck, startListservRun } from "@/lib/importer/importer";
import { dismissSource, retrySource } from "@/lib/importer/queue";
import { deckIdsIn } from "@/lib/importer/rules";

async function requireAdmin() {
  const user = await requireUser("/admin/imports");
  if (!isAdmin(user.netid)) notFound();
  return user;
}

export type ImportState = { message?: string; error?: string } | undefined;

/* Reading decks takes minutes, longer than Cloudflare keeps a request open, so
   these start the work, answer at once, and finish it after responding. The
   imports page shows what's still going and refreshes itself until it's done. */

/* paste a deck link (works without InboxEngine) */
export async function importLinkAction(_: ImportState, f: FormData): Promise<ImportState> {
  await requireAdmin();
  const [deckId] = deckIdsIn([String(f.get("url") ?? "").trim()]);
  if (!deckId) return { error: "That isn't a Google Slides link." };
  const email = {
    messageId: null,
    subject: String(f.get("subject") ?? "").trim(),
    text: "",
    listserv: null,
    authorName: String(f.get("authorName") ?? "").trim() || null,
    authorEmail: String(f.get("authorEmail") ?? "").trim() || null,
    sentAt: null,
  };
  const started = await startDeck(deckId, email);
  if ("skipped" in started) return { message: `Already imported: ${started.skipped.detail}` };
  after(() => readDeck(started.sourceId, deckId, email));
  revalidatePath("/admin/imports");
  return { message: "Reading the deck. Its items show up below when it's done; a big deck takes a few minutes." };
}

export async function runNowAction(): Promise<ImportState> {
  await requireAdmin();
  try {
    const run = await startListservRun();
    after(() => finishListservRun(run));
    revalidatePath("/admin/imports");
    return { message: "Searching the listserv. The result shows above the queue when it's done." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function inviteAction(_: ImportState, f: FormData): Promise<ImportState> {
  await requireAdmin();
  try {
    const r = await sendInvite(String(f.get("sourceId") ?? ""));
    revalidatePath("/admin/imports");
    return { message: r.test ? `Test invite sent to ${r.to} (not the seller).` : `Invite sent to ${r.to}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function reviewAction(f: FormData) {
  await requireAdmin();
  const ids = f.getAll("id").map(String);
  if (f.get("decision") === "approve") await approve(ids);
  else await reject(ids);
  revalidatePath("/", "layout");
  // from a listing's preview page: back to the queue
  if (f.get("back") === "queue") redirect("/admin/imports");
}

export async function sourceAction(_: ImportState, f: FormData): Promise<ImportState> {
  await requireAdmin();
  const id = String(f.get("sourceId") ?? "");
  const decision = f.get("decision");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { error: "Invalid import." };
  if (decision !== "done" && decision !== "retry") return { error: "Invalid action." };
  try {
    if (decision === "done") await dismissSource(id);
    else after(await retrySource(id));
    revalidatePath("/admin/imports");
    return { message: decision === "done" ? "Cleared from the queue. Listings are unchanged." : "Retry started. This page will update when it finishes." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
