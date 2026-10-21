"use server";
/* Admin-only actions for the listserv import. Each re-checks the session and
   the admin list itself: a Server Action is a public endpoint. */
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { approve, isAdmin, reject, sendInvite } from "@/lib/importer/admin";
import { importDeck, runListservImport } from "@/lib/importer/importer";
import { deckIdsIn } from "@/lib/importer/rules";

async function requireAdmin() {
  const user = await requireUser("/admin/imports");
  if (!isAdmin(user.netid)) notFound();
  return user;
}

export type ImportState = { message?: string; error?: string } | undefined;

/* paste a deck link (works without InboxEngine) */
export async function importLinkAction(_: ImportState, f: FormData): Promise<ImportState> {
  await requireAdmin();
  const [deckId] = deckIdsIn([String(f.get("url") ?? "").trim()]);
  if (!deckId) return { error: "That isn't a Google Slides link." };
  const r = await importDeck(deckId, {
    messageId: null,
    subject: String(f.get("subject") ?? "").trim(),
    text: "",
    listserv: null,
    authorName: String(f.get("authorName") ?? "").trim() || null,
    authorEmail: String(f.get("authorEmail") ?? "").trim() || null,
    sentAt: null,
  });
  revalidatePath("/admin/imports");
  return r.status === "failed"
    ? { error: `Couldn't import that deck: ${r.detail}` }
    : { message: `${r.status === "skipped" ? "Already imported" : "Imported"}: ${r.detail}` };
}

export async function runNowAction(): Promise<ImportState> {
  await requireAdmin();
  try {
    const r = await runListservImport();
    revalidatePath("/admin/imports");
    const created = [...r.decks, ...r.emailSales].reduce((n, d) => n + d.created, 0);
    return {
      message: `Checked ${r.emails} sale emails since ${new Date(r.since).toLocaleDateString()}: ${r.decks.length} decks, ${r.emailSales.length} sales written in the email, ${created} items for review.`,
    };
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
