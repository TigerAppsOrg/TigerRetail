/* Run the listserv import against the running app: npm run import
   (needs CRON_SECRET in .env.local; the app needs INBOX_ENGINE_* and ANTHROPIC_API_KEY).
   npm run import -- --days 30 rescans the last 30 days; decks already read are skipped.
   npm run import -- --backfill-contacts reads contact details for sales imported before we kept them.
   npm run import -- --rematch-photos matches photos to items on multi-item slides imported before we did.
   npm run import -- --resort re-judges section and department (women's/men's) for unclaimed imported items.
   npm run import -- --place pins sales whose pickup spot names a building on the map. */
process.loadEnvFile(".env.local");
const base = process.env.APP_URL ?? "http://localhost:3000";
const i = process.argv.indexOf("--days");
const query = process.argv.includes("--backfill-contacts")
  ? "?backfill=contacts"
  : process.argv.includes("--rematch-photos")
    ? "?backfill=photos"
    : process.argv.includes("--resort")
      ? "?backfill=categories"
      : process.argv.includes("--place")
        ? "?backfill=places"
    : i > 0
      ? `?days=${Number(process.argv[i + 1])}`
      : "";
const res = await fetch(`${base}/api/cron/import${query}`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
const body = await res.json();
console.log(JSON.stringify(body, null, 2));
process.exit(res.ok ? 0 : 1);
