import { NextResponse, type NextRequest } from "next/server";
import { backfillContacts, placeSales, rematchPhotos, resortItems, runListservImport } from "@/lib/importer/importer";

/* Scheduled listserv import (vercel.json runs it once a day at 13:00 UTC; Vercel's
   free plan allows daily crons only; `npm run import` calls it locally).
   Protected by CRON_SECRET, sent as a Bearer token.
   ?days=N rescans the last N days (up to 90) instead of picking up where the last run ended.
   ?backfill=contacts reads contact details for sales imported before we kept them.
   ?backfill=photos matches photos to items on slides imported before we did.
   ?backfill=categories re-judges section and department for unclaimed imported items.
   ?backfill=places pins sales whose pickup spot names a building. */
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET isn't set" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const backfill = req.nextUrl.searchParams.get("backfill");
    if (backfill === "contacts") return NextResponse.json({ contacts: await backfillContacts() });
    if (backfill === "photos") return NextResponse.json({ photos: await rematchPhotos() });
    if (backfill === "categories") return NextResponse.json({ categories: await resortItems() });
    if (backfill === "places") return NextResponse.json({ places: await placeSales() });
    const days = Number(req.nextUrl.searchParams.get("days") ?? "");
    const r = await runListservImport(days > 0 ? { days: Math.min(days, 90) } : {});
    return NextResponse.json({
      since: r.since,
      emails: r.emails,
      decks: r.decks.map((d) => ({ deck: d.deckId, status: d.status, detail: d.detail })),
      emailSales: r.emailSales.map((e) => ({ message: e.messageId, status: e.status, detail: e.detail })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
