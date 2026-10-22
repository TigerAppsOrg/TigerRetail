import "server-only";
import { sql, type Row } from "./db";
import { isReservedNetid } from "./cas";
import { avatarUrl } from "./storage";
import type { Person } from "./data";

// Callers must supply the viewer from the verified session.
export async function searchRecipients(viewer: string, input: string): Promise<Person[]> {
  const term = input.trim().toLowerCase().slice(0, 80);
  if (!term) return [];
  const rows = await sql()<Row[]>`select netid, display_name, avatar_path from users
    where netid <> ${viewer} and netid <> 'listserv' and netid not like 'seed-%' and netid not like 'e2e-%'
      and (strpos(lower(netid), ${term}) > 0 or strpos(lower(coalesce(display_name, '')), ${term}) > 0)
    order by netid limit 20`;
  return rows.map(r => ({ netid: r.netid as string, displayName: r.display_name as string | null, avatarUrl: r.avatar_path ? avatarUrl(r.avatar_path as string) : null }));
}

export async function startDirectConversation(viewer: string, input: string): Promise<string> {
  const recipient = input.trim().toLowerCase();
  if (!/^[a-z0-9_]+$/.test(recipient) || recipient === viewer || isReservedNetid(recipient)) throw new Error("Choose another registered person.");
  const [user] = await sql()`select netid from users where netid = ${recipient}`;
  if (!user) throw new Error("That person has not registered yet.");
  // Stable ordering plus a unique index handles simultaneous starts from either side.
  const [first, second] = [viewer, recipient].sort();
  const [row] = await sql()`insert into conversations (listing_id, buyer_netid, seller_netid)
    values (null, ${first}, ${second})
    on conflict (buyer_netid, seller_netid) where listing_id is null
    do update set buyer_netid = excluded.buyer_netid returning id`;
  return row.id as string;
}
