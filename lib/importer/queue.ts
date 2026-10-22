import "server-only";
import { sql, type Row } from "../db";
import { readDeck, readEmailSource } from "./importer";

export async function dismissSource(id: string): Promise<void> {
  const rows = await sql()`update import_sources set dismissed_at = now()
    where id = ${id} and status = 'done' and submitted_by is null
      and not exists (select 1 from listings where import_source_id = ${id} and status = 'review')
    returning id`;
  if (!rows.length) throw new Error("Review the remaining items first; only completed imports can be cleared.");
}

// Claim before returning to the browser. Concurrent clicks cannot start two readers.
// Never rerun a partial import with listings: that could duplicate published items.
export async function retrySource(id: string): Promise<() => Promise<void>> {
  const [source] = await sql()<Row[]>`update import_sources
    set status = 'pending', error = null, created_at = now(), dismissed_at = null
    where id = ${id} and status = 'failed' and submitted_by is null
      and not exists (select 1 from listings where import_source_id = ${id})
    returning *`;
  if (!source) throw new Error("This import is already running, completed, or has items that need review. Refresh the page.");
  return async () => {
    try {
      if (source.kind === "email") {
        await readEmailSource(id, source.message_id as string);
      } else {
        await readDeck(id, source.deck_id as string, {
          messageId: source.message_id as string | null,
          subject: (source.subject as string) ?? "", text: "",
          listserv: source.listserv as string | null,
          authorName: source.author_name as string | null,
          authorEmail: source.author_email as string | null,
          sentAt: source.sent_at as string | null,
        });
      }
    } catch (e) {
      await sql()`update import_sources set status = 'failed', error = ${e instanceof Error ? e.message : String(e)} where id = ${id}`;
    }
  };
}
