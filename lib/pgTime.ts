/* Postgres timestamp text → "2026-10-21T03:48:01.004591Z": UTC, all six
   decimal places, always the same width. The app compares timestamps as text
   (unread messages, "messages after this one"), so text order must be time
   order, and microseconds must survive: JavaScript dates only keep
   milliseconds, which made the newest message look newer than itself. */
const PG = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?)?(?:([+-])(\d{2})(?::?(\d{2}))?)?$/;

export function pgTimestampToIso(text: string): string {
  const m = PG.exec(text.trim());
  if (!m) throw new Error(`not a timestamp: ${text}`);
  const [, date, hh = "00", mm = "00", ss = "00", frac = "", sign, oh = "00", om = "00"] = m;
  const micros = frac.padEnd(6, "0");
  // whole seconds through Date (the zone shift), the microseconds carried alongside
  const offsetMin = sign ? (sign === "-" ? -1 : 1) * (Number(oh) * 60 + Number(om)) : 0;
  const utcMs = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), +hh, +mm, +ss) - offsetMin * 60_000;
  return `${new Date(utcMs).toISOString().slice(0, 19)}.${micros}Z`;
}
