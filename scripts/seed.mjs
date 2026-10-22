/* Fill the dev database with a fixture marketplace, so the app
   can be seen with data in it. Dev only: it writes with the database and S3
   settings in .env.local and never runs in the app.

     npm run seed -- --owner <netid>   seed (fixture listings owned by "me" go to <netid>)
     npm run seed:clear                remove everything this script added

   Data and illustrations live in fixtures/seed/. Each item's illustration
   is rendered to a PNG and uploaded as its photo.

   Everything seeded is findable again: photos live under listing-photos/seed/,
   and every seeded person's netid starts with "seed-" (so a fixture netid
   like hm3390 can never collide with a real student's). Listings given to
   --owner are found by their seed/ photo path. Drafts (no draft support yet)
   are skipped; "on hold" items are seeded as active. */
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { artSvg } from "../fixtures/seed/art.mjs";
import { db, insert, putPhoto, removePhotos } from "../e2e/testdb.mjs";

const BUCKET = "listing-photos";

const args = process.argv.slice(2);
const clearOnly = args.includes("--clear");
const owner = args.includes("--owner") ? args[args.indexOf("--owner") + 1] : null;

async function clear() {
  // a seeded listing is one whose photos live under seed/
  const mine = await db`select id, photo_paths from listings where exists (select 1 from unnest(photo_paths) p where p like 'seed/%')`;
  const ids = mine.map((l) => l.id);
  const paths = [...new Set(mine.flatMap((l) => l.photo_paths))];
  if (ids.length) await db`delete from listings where id in ${db(ids)}`;
  const users = await db`delete from users where netid like 'seed-%' returning netid`; // cascades their listings + offers
  // rows first, photos last: a run killed midway leaves unused photos, never broken listings
  if (paths.length) await removePhotos(BUCKET, paths);
  console.log(`cleared ${ids.length} seeded listings, ${paths.length} photos, ${users.length} seed users`);
}

if (clearOnly) {
  await clear();
  await db.end();
  process.exit(0);
}
if (!owner) {
  console.error("Usage: npm run seed -- --owner <your netid>   (fixture listings owned by me go to that account)");
  process.exit(1);
}
const ownerRow = await db`select netid, phone, payments, building from users where netid = ${owner}`;
if (!ownerRow.length) throw new Error(`No user ${owner}. Sign in once through CAS first, then seed.`);

await clear(); // re-seeding replaces, never duplicates

// ---- 1. read the development seed fixtures ----
const listings = JSON.parse(readFileSync(new URL("../fixtures/seed/listings.json", import.meta.url), "utf8"));
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 480, height: 600 }, deviceScaleFactor: 1 });

/* render one illustration as a 480×600 PNG */
async function art(artName, pal) {
  const svg = artSvg(artName, pal);
  await page.setContent(`<body style="margin:0">${svg.replace('class="art"', 'width="480" height="600"')}</body>`);
  return page.locator("svg").screenshot({ type: "png" });
}

// ---- 2. people ----
// Dorms that exist in Princeton's Buildings layer (same list the map demo uses)
const DORMS = ["1976 Hall", "Bloomberg Hall", "Wilf Hall", "Forbes College Main", "Lauritzen Hall", "Holder Hall", "Blair Hall",
  "Kanji Hall", "Hariri Hall", "Walker Hall", "Spelman Halls", "Scully Hall", "Witherspoon Hall", "Class of 1981 Hall", "Pyne Hall"];
const seedNetid = (n) => `seed-${n}`;
const people = new Set();
for (const l of listings) {
  if (l.owner !== "me" && l.seller) people.add(l.seller);
  for (const o of l.offers) people.add(o.netid);
}
const peopleRows = [...people].map((n, i) => ({
  netid: seedNetid(n),
  phone: `609555${String(100 + i).padStart(4, "0")}`, // 555-01xx: numbers reserved for fiction
  payments: i % 3 === 0 ? [{ id: "cash", handle: "" }] : [{ id: "venmo", handle: `@${n}` }, { id: "cash", handle: "" }],
  building: DORMS[i % DORMS.length],
  room_directions: i % 2 ? "ground floor, end of the hall" : null,
  onboarded_at: new Date().toISOString(),
}));
await insert("users", peopleRows);
const byNetid = new Map(peopleRows.map((p) => [p.netid, p]));
byNetid.set(owner, ownerRow[0]);

// ---- 3. listings with photos ----
const APPAREL = new Set(["clothing", "special occasions"]);
const DAY = 86_400_000;
let made = 0;
const offersToMake = [];
for (const [i, l] of listings.entries()) {
  if (l.status === "draft") continue;
  const seller = l.owner === "me" ? owner : seedNetid(l.seller);
  const who = byNetid.get(seller);
  const cover = await art(l.art, l.pal);
  const photos = [cover];
  if (l.photos > 1 && i % 3 === 0) photos.push(await art(l.art, "cream")); // a second angle on some items
  const paths = [];
  for (const [k, png] of photos.entries()) {
    const path = `seed/${seller}/${i}-${k}.png`;
    await putPhoto(BUCKET, path, png, "image/png");
    paths.push(path);
  }
  const [row] = await insert("listings", {
    seller_netid: seller,
    title: l.title,
    description: l.desc ?? "",
    price_cents: Math.round(l.price * 100),
    section: l.cat,
    sub: l.sub,
    dept: APPAREL.has(l.cat) ? l.dept : "misc",
    brand: l.brand === "unbranded" ? "" : l.brand,
    condition: l.condition,
    occasion: l.occasion ?? "none",
    sizing: l.sizing,
    size: l.size,
    size_facet: l.sizeFacet,
    try_on: APPAREL.has(l.cat) && !!l.tryOn,
    photo_paths: paths,
    status: l.status === "sold" ? "sold" : "active", // no "on hold" yet
    created_at: new Date(Date.now() - l.ageDays * DAY - i * 37 * 60_000).toISOString(),
    contact_email: `${seller}@princeton.edu`,
    contact_phone: who.phone,
    pickup: `meet outside ${who.building ?? "my dorm"}, evenings work best`,
    payments: who.payments,
  });
  made++;
  if (l.status === "active" || l.status === "hold") {
    for (const o of l.offers) offersToMake.push({ listing_id: row.id, buyer_netid: seedNetid(o.netid), amount_cents: Math.round(o.amt * 100), message: o.tryOn ? "could i try it on first?" : "" });
  }
}
await browser.close();
if (offersToMake.length) await insert("offers", offersToMake);

// a few buyers message the owner about their listings, so the inbox has something in it
const QUESTIONS = ["hi! is this still available?", "could i try it on before i offer?", "would you take a little less if i pick up today?"];
const ownerListings = await db`select id, photo_paths from listings where seller_netid = ${owner}`;
const mineIds = new Set(ownerListings.filter((l) => l.photo_paths.some((p) => p.startsWith("seed/"))).map((l) => l.id));
let convs = 0;
for (const [k, o] of offersToMake.entries()) {
  if (!mineIds.has(o.listing_id) || convs >= 3) continue;
  const at = new Date(Date.now() - (convs + 1) * 47 * 60_000).toISOString();
  const [c] = await insert("conversations", { listing_id: o.listing_id, buyer_netid: o.buyer_netid, seller_netid: owner, last_message_at: at, last_sender_netid: o.buyer_netid, buyer_read_at: at });
  await insert("messages", { conversation_id: c.id, sender_netid: o.buyer_netid, body: QUESTIONS[k % QUESTIONS.length], created_at: at });
  convs++;
}

const ownerCount = listings.filter((l) => l.owner === "me" && l.status !== "draft").length;
console.log(`seeded ${made} listings (${ownerCount} on ${owner}), ${peopleRows.length} seed people, ${offersToMake.length} offers, ${convs} conversations`);
await db.end();
