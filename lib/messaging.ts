/* Messaging rules, pure: who may talk about what, what a message may be,
   and what counts as unread. lib/data enforces these on every write. */

export const MAX_MESSAGE = 2000;

/* A buyer can ask about any active listing that isn't theirs. A seller can
   open a conversation only with someone who made an offer on their item;
   otherwise sellers just reply to conversations buyers start. */
export function startBlocker(
  listing: { sellerNetid: string; status: string },
  viewer: string,
  withBuyer: string | null,
  buyerHasOffer: boolean,
): string | null {
  if (withBuyer === null || withBuyer === viewer) {
    if (listing.sellerNetid === viewer) return "This is your listing.";
    if (listing.status !== "active") return "This item has been sold.";
    return null;
  }
  if (listing.sellerNetid !== viewer) return "Only the seller can message a buyer about this item.";
  if (!buyerHasOffer) return "You can message people who made an offer on your item.";
  return null;
}

export function cleanMessage(input: string): { ok: true; body: string } | { ok: false; error: string } {
  const body = input.replace(/\r\n/g, "\n").trim();
  if (!body) return { ok: false, error: "Write something first." };
  if (body.length > MAX_MESSAGE) return { ok: false, error: `Keep messages under ${MAX_MESSAGE} characters.` };
  return { ok: true, body };
}

export interface ConversationState {
  buyerNetid: string;
  sellerNetid: string;
  lastMessageAt: string | null;
  lastSenderNetid: string | null;
  buyerReadAt: string | null;
  sellerReadAt: string | null;
}

export const isParticipant = (c: { buyerNetid: string; sellerNetid: string }, viewer: string) =>
  c.buyerNetid === viewer || c.sellerNetid === viewer;

/* Unread for `viewer`: the other person wrote last, after `viewer` last looked. */
export function isUnread(c: ConversationState, viewer: string): boolean {
  if (!c.lastMessageAt || c.lastSenderNetid === viewer) return false;
  const readAt = c.buyerNetid === viewer ? c.buyerReadAt : c.sellerReadAt;
  return !readAt || readAt < c.lastMessageAt;
}

/* Timestamps in Princeton time, so the server and every browser print the same thing. */
const ET = "America/New_York";
export function messageTime(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { timeZone: ET, month: "short", day: "numeric" }).toLowerCase();
  const time = d.toLocaleTimeString("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" }).toLowerCase();
  return `${day} · ${time}`;
}

/* Inbox: "now", "5m", "3h", "2d", then the date. */
export function ago(iso: string, now: Date): string {
  const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString("en-US", { timeZone: ET, month: "short", day: "numeric" }).toLowerCase();
}
