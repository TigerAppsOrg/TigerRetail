/* End-to-end check of the listserv import, against the running dev server
   and the team database and R2 bucket.

     npm run dev            (in another terminal)
     npm run e2e:import

   Reading a deck needs ANTHROPIC_API_KEY and searching the listserv needs an
   InboxEngine token. Without them this checks that each says so plainly.
   Review → approve → claim runs on a test deck written straight into the
   database (the shape importDeck produces), so it works without either.
   Test accounts start "e2e-" (CAS can never issue those); everything is
   deleted at the end. */
import { chromium } from "playwright-core";
import { sealData } from "iron-session";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { db, insert, putPhoto, removePhotos } from "./testdb.mjs";

const URL = process.env.URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? join(homedir(), "Desktop", "UX screenshots", "TigerRetail", "listserv-import");
mkdirSync(SHOTS, { recursive: true });

const ADMIN = "e2e-admin"; // listed in ADMIN_NETIDS in .env.local
const POSTER = "e2e-poster"; // posted the sale; can claim it
const BUYER = "e2e-shopper"; // anyone else
const FRESH = "e2e-fresh"; // posted the email sale; signs in for the first time from the invite (never onboarded)
const POSTED_PHONE = "6095550199"; // what the test sale's own post gave
const TEST_DECK = "e2e-deck-000000000000000000";
const OWN_DECK = "e2e-owndeck-00000000000000"; // a seller pasted it on the sell page
const EMAIL_MSG = "e2e-msg-000000000000000000000000"; // a sale written in an email, with photos
const NOT_SALE_MSG = "e2e-msg-notasale000000000000000"; // read, found not to be selling items
const REAL_DECK = "1lJc6xyZXj-xCubvaj6PwKh75p4RykmAaHnSPx0jTWeM"; // the "SENIOR SALE" deck from the listserv

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failed++;
};
const seen = (locator, ms = 15_000) => locator.first().waitFor({ timeout: ms }).then(() => true, () => false);
const shot = async (page, name) => {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => window.scrollTo(0, 0));
  const path = join(SHOTS, `${name}.png`);
  await page.screenshot({ path, fullPage: true, caret: "initial" });
  console.log(`  📸 ${path}`);
};
/* the real deck may already be in the queue from a real listserv run: then the
   test leaves it alone and must not delete it */
let realDeckWasThere = false;
async function cleanup() {
  const decks = realDeckWasThere ? [TEST_DECK, OWN_DECK] : [TEST_DECK, OWN_DECK, REAL_DECK];
  const srcs = await db`select id from import_sources where deck_id in ${db(decks)} or message_id in ${db([EMAIL_MSG, NOT_SALE_MSG])}`;
  for (const s of srcs) {
    const rows = await db`select photo_paths from listings where import_source_id = ${s.id}`;
    const paths = rows.flatMap((r) => r.photo_paths);
    // rows first, photos last: if this run is killed midway, it leaves unused
    // photos behind, never listings pointing at deleted ones
    await db`delete from listings where import_source_id = ${s.id}`;
    await db`delete from import_sources where id = ${s.id}`;
    if (paths.length) await removePhotos("listing-photos", paths);
  }
  await db`delete from users where netid in ${db([ADMIN, POSTER, BUYER, FRESH])}`;
}
async function as(browser, netid) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const seal = await sealData({ netid }, { password: process.env.SESSION_SECRET, ttl: 3600 });
  await ctx.addCookies([{ name: "tr_session", value: seal, url: URL, httpOnly: true, sameSite: "Lax" }]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${netid}: ${e.message}`));
  return page;
}
const errors = [];

realDeckWasThere = (await db`select id from import_sources where deck_id = ${REAL_DECK} and status = 'done'`).length > 0;
await cleanup();
const onboarded = (netid, extra = {}) => ({ netid, display_name: null, phone: "6095550404", payments: [{ id: "venmo", handle: `@${netid}` }], building: "Wilf Hall", onboarded_at: new Date().toISOString(), ...extra });
await insert("users", [onboarded(ADMIN), onboarded(POSTER, { display_name: "Pat Poster" }), onboarded(BUYER)]);
await insert("users", { netid: FRESH });

// the test deck, as importDeck would leave it: a source and two items waiting for review
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const photo = `imports/${TEST_DECK}/3-e2e.png`;
await putPhoto("listing-photos", photo, png, "image/png");
const [src] = await insert("import_sources", {
  deck_id: TEST_DECK,
  deck_url: `https://docs.google.com/presentation/d/${TEST_DECK}/edit`,
  subject: "e2e junior sale",
  listserv: "BUTLERBUZZ",
  author_name: "Pat Poster",
  author_email: `${POSTER}@princeton.edu`,
  sent_at: new Date().toISOString(),
  status: "done",
  slides: 5,
  items_found: 2,
  error: "1 marked sold",
  seller_notes: ["priority to people who don't need try-ons"],
});
const item = (title, cents, slide) => ({
  seller_netid: "listserv",
  status: "review",
  title,
  description: "",
  price_cents: cents,
  section: "clothing",
  sub: "tops",
  dept: "women's",
  brand: "",
  condition: "not stated",
  occasion: "none",
  sizing: { system: "alpha", alpha: "x-small", waist: "28", length: "30", fit: "straight", shoe: "8", scale: "women's" },
  size: "x-small–small",
  size_facet: "x-small",
  try_on: false,
  photo_paths: [photo],
  // what the sale's own post said, shown to signed-in viewers once approved
  contact_email: `${POSTER}@princeton.edu`,
  contact_phone: POSTED_PHONE,
  pickup: "1901 Hall, room 214",
  contact_public: true,
  payments: [{ id: "venmo", handle: "@pat-sells" }],
  import_source_id: src.id,
  import_slide: slide,
});
const [tank, cami] = await insert("listings", [item("e2e polka dot tank top", 1000, 3), item("e2e lace cami", 800, 4)]);

// a sale written in the email, as importEmailSale would leave it; and an email that wasn't a sale
const email = (message_id, extra) => ({ kind: "email", message_id, listserv: "WHITMANWIRE", author_name: "Frankie Fresh", author_email: `${FRESH}@princeton.edu`, sent_at: new Date().toISOString(), status: "done", ...extra });
const [emailSrc] = await insert("import_sources", [
  email(EMAIL_MSG, { subject: "e2e selling my desk", email_url: `https://inbox.tigerapps.org/email/${EMAIL_MSG}`, items_found: 1, error: null }),
  email(NOT_SALE_MSG, { subject: "e2e concert tickets", email_url: `https://inbox.tigerapps.org/email/${NOT_SALE_MSG}`, items_found: 0, error: "not selling items" }),
]);
const [desk] = await insert("listings", [
  { ...item("e2e oak desk", 4000, 1), section: "dorm", sub: "furniture", dept: "misc", size: "n/a", size_facet: "n/a", sizing: { system: "na", alpha: "medium", waist: "28", length: "30", fit: "straight", shoe: "8", scale: "women's" }, import_source_id: emailSrc.id },
]);

// a deck the shopper pasted on the sell page, as importOwnDeck would leave it: their own drafts
const [ownSrc] = await insert("import_sources", {
  deck_id: OWN_DECK,
  deck_url: `https://docs.google.com/presentation/d/${OWN_DECK}/edit`,
  subject: "",
  author_email: `${BUYER}@princeton.edu`,
  submitted_by: BUYER,
  status: "done",
  slides: 3,
  items_found: 2,
  error: "1 marked sold",
});
const draft = (title, cents, slide) => ({ ...item(title, cents, slide), seller_netid: BUYER, contact_email: `${BUYER}@princeton.edu`, contact_phone: "6095550404", pickup: "", contact_public: false, payments: [{ id: "venmo", handle: `@${BUYER}` }], import_source_id: ownSrc.id });
const [jacket, scarf] = await insert("listings", [draft("e2e jean jacket", 2500, 2), draft("e2e plaid scarf", 900, 3)]);

const browser = await chromium.launch({ channel: "chrome" });
try {
  // ---- who can see what ----
  const buyer = await as(browser, BUYER);
  const adminPage = await buyer.goto(`${URL}/admin/imports`);
  check(await seen(buyer.getByText("This page could not be found")), `non-admins get 'not found' for the admin page (${adminPage.status()})`);
  await buyer.goto(`${URL}/listings/${tank.id}`);
  check(await seen(buyer.getByText("This page could not be found")), "an item waiting for review is invisible to everyone else");

  const cronNoAuth = await fetch(`${URL}/api/cron/import`);
  check(cronNoAuth.status === 401, "the cron endpoint refuses calls without CRON_SECRET");
  // with a real token an authorized call IS the real import, so the test only makes it without one
  if (!process.env.INBOX_ENGINE_TOKEN) {
    const cron = await fetch(`${URL}/api/cron/import`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const cronBody = await cron.json();
    check(cron.status === 502 && /INBOX_ENGINE_TOKEN/.test(cronBody.error), `without a token the cron run says so: "${cronBody.error}"`);
  }

  // ---- admin: the page, a real deck, the queue ----
  const admin = await as(browser, ADMIN);
  await admin.goto(`${URL}/profile`);
  check(await seen(admin.getByRole("link", { name: /listserv imports/ })), "admins get a link from their profile");
  await admin.goto(`${URL}/admin/imports`);
  check(await seen(admin.getByRole("heading", { name: "listserv imports" })), "admin page loads");
  if (!process.env.ANTHROPIC_API_KEY) check(await seen(admin.getByText("ANTHROPIC_API_KEY isn’t set")), "the page says plainly that decks can't be read without the API key");

  await admin.getByLabel("slides link").fill(`https://docs.google.com/presentation/d/${REAL_DECK}/edit?usp=sharing`);
  await admin.getByLabel("email subject").fill("SENIOR SALE");
  await admin.getByRole("button", { name: "import" }).click();
  if (realDeckWasThere) {
    check(await seen(admin.getByText(/^Already imported/), 30_000), "a deck already in the queue isn't read (or paid for) twice");
  } else if (process.env.ANTHROPIC_API_KEY) {
    check(await seen(admin.getByText(/^Imported: \d+ for review/), 300_000), "the real deck was read into items for review");
    console.log("   ", await admin.getByText(/^Imported: /).textContent());
    await admin.reload();
    await shot(admin, "00-real-deck-review");
    const [s] = await db`select id, slides, items_found, error from import_sources where deck_id = ${REAL_DECK}`;
    const got = await db`select import_slide, title, price_cents, size, section, sub, condition, description from listings where import_source_id = ${s.id} order by import_slide`;
    console.log(`    ${s.slides} slides → ${s.items_found} items; skipped: ${s.error ?? "none"}`);
    for (const r of got) console.log(`    slide ${String(r.import_slide).padStart(2)}  $${(r.price_cents / 100).toString().padEnd(5)} ${r.title.padEnd(34)} ${r.sub.padEnd(18)} ${r.size.padEnd(14)} ${r.condition}${r.description ? `  · ${r.description}` : ""}`);
    check(got.every((r) => !/\d{3}[\s.-]?\d{3}[\s.-]?\d{4}/.test(`${r.title} ${r.description}`)), "no phone number made it into any imported item");
  } else {
    check(await seen(admin.getByText(/Couldn't import that deck: ANTHROPIC_API_KEY is not set/), 240_000), "a real deck is fetched, then stops at the missing API key with that reason");
    await admin.reload();
    check(await seen(admin.locator(".review-deck", { hasText: "SENIOR SALE" }).getByText("failed")), "the failed deck is recorded (and retried on the next run)");
  }

  await admin.getByLabel("slides link").fill("https://example.com/not-slides");
  await admin.getByRole("button", { name: "import" }).click();
  check(await seen(admin.getByText("That isn't a Google Slides link.")), "a non-slides link is refused");

  // with a token, "run now" is the real import: done deliberately, not as a test side effect
  if (!process.env.INBOX_ENGINE_TOKEN) {
    await admin.getByRole("button", { name: "run now" }).click();
    check(await seen(admin.getByText(/INBOX_ENGINE_TOKEN/).nth(1)), "'run now' without a token says what's missing");
  }

  await admin.reload();
  const deck = admin.locator(".review-deck", { hasText: "e2e junior sale" });
  check(await seen(deck.getByText("e2e polka dot tank top")), "the review queue shows each item with its slide");
  check(await seen(deck.getByText("skipped: 1 marked sold")), "…and why others were skipped");
  check(await seen(deck.getByRole("button", { name: "approve all 2 from Pat Poster" })), "each seller's sale has 'approve all' at the top");
  const mail = admin.locator(".review-deck", { hasText: "e2e selling my desk" });
  check(await seen(mail.getByText("e2e oak desk")), "a sale written in an email is in the queue too");
  check(await seen(mail.getByText("item 1")), "…its items are numbered, not given slide numbers");
  check((await mail.getByRole("link", { name: "original email" }).getAttribute("href")) === `https://inbox.tigerapps.org/email/${EMAIL_MSG}`, "…and it links the original email");
  check(!(await admin.getByText("e2e concert tickets").count()), "an email that wasn't a sale stays out of the queue");
  await shot(admin, "01-review-queue");
  await deck.locator(".card", { hasText: "e2e lace cami" }).getByRole("button", { name: "reject" }).click();
  await admin.waitForTimeout(1500);
  await admin.reload();
  check(!(await admin.getByText("e2e lace cami").count()), "rejecting removes the item");
  check((await db`select id from listings where id = ${cami.id}`).length === 0, "…from the database too");
  await admin.locator(".review-deck", { hasText: "e2e junior sale" }).locator(".card", { hasText: "e2e polka dot tank top" }).getByRole("button", { name: "approve" }).click();
  await admin.waitForTimeout(1500);
  // open the desk from the queue: the full listing, before it's approved, and approve it there
  await admin.locator(".review-deck", { hasText: "e2e selling my desk" }).getByRole("link", { name: /e2e oak desk/ }).click();
  await admin.waitForURL(`${URL}/listings/${desk.id}`);
  check(await seen(admin.getByText(/exactly what buyers will see once approved/)), "clicking an item in the queue opens the full listing as it will be posted");
  await shot(admin, "05-admin-preview-listing");
  await admin.getByRole("button", { name: "approve", exact: true }).click();
  await admin.waitForURL(`${URL}/admin/imports`);
  check((await db`select status from listings where id = ${desk.id}`)[0].status === "active", "approving from the listing page publishes it and goes back to the queue");

  // ---- public: from the listserv ----
  await buyer.goto(`${URL}/listings/${desk.id}`);
  check(await seen(buyer.getByRole("heading", { name: "e2e oak desk" })), "an approved email item is public");
  check(await seen(buyer.getByRole("link", { name: "see the original email" })), "buyers are pointed at the original email");
  await shot(buyer, "02b-imported-email-listing");
  await buyer.goto(`${URL}/listings/${tank.id}`);
  check(await seen(buyer.getByRole("heading", { name: "e2e polka dot tank top" })), "approved: the item is public");
  check(await seen(buyer.getByText("from Pat Poster's sale on butlerbuzz")), "it credits the sale it came from");
  check(await seen(buyer.getByRole("link", { name: "see the original slides" })), "buyers are pointed at the original slides");
  check(await seen(buyer.getByText("609-555-0199")) && (await seen(buyer.getByText("1901 Hall, room 214"))), "signed in, buyers see the phone and pickup the sale's post gave");
  check(await seen(buyer.getByText("venmo @pat-sells")), "…and the payment handle");
  check(await seen(buyer.getByText("priority to people who don't need try-ons")), "…and the seller's own instructions for the sale");
  check(!(await buyer.getByRole("button", { name: "make an offer" }).count()), "no offer button before it's claimed");
  check(!(await buyer.getByRole("link", { name: /this is my sale/ }).count()), "someone else can't claim it");
  await shot(buyer, "02-imported-listing");
  const visitor = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  await visitor.goto(`${URL}/listings/${tank.id}`);
  check(await seen(visitor.getByRole("link", { name: "sign in to see how to reach them" })), "signed out, the contact details stay hidden");
  check(!(await visitor.getByText("609-555-0199").count()) && !(await visitor.getByText("1901 Hall").count()), "…no phone, no pickup on the page");
  check(!(await visitor.getByText("priority to people who don't need try-ons").count()), "…nor the seller's notes");
  await buyer.goto(`${URL}/browse?cat=clothing&sub=tops`);
  check(await seen(buyer.locator("a.card", { hasText: "e2e polka dot tank top" })), "approved imports show in browse");

  // ---- the admin invites the poster ----
  await admin.goto(`${URL}/admin/imports`);
  const sale = admin.locator(".review-deck", { hasText: "e2e junior sale" });
  check(await seen(sale.getByRole("button", { name: "send invite" })), "each sale with a princeton address has a 'send invite' button");
  // tests never send real email: the button is only clicked when no email service is set up
  if (!process.env.SENDGRID_API_KEY && !process.env.RESEND_API_KEY) {
    await sale.getByRole("button", { name: "send invite" }).click();
    check(await seen(sale.getByText(/No email service is set up/)), "with no email service set up, the invite says what's missing");
    const [s0] = await db`select invited_at from import_sources where id = ${src.id}`;
    check(s0.invited_at === null, "…and nothing is recorded as sent");
  }
  await admin.goto(`${URL}/welcome/${src.id}`);
  check(await seen(admin.getByText(/preview: this is what Pat Poster sees/)), "an admin opening the invite link sees a preview");
  check(await admin.getByRole("button", { name: /^add (it|them) to my account$/ }).isDisabled(), "…with the buttons off");
  await shot(admin, "04-welcome-preview");

  // ---- sellers paste their own deck on the sell page ----
  await buyer.goto(`${URL}/sell`);
  const deckBox = buyer.locator("form", { hasText: "have your sale in google slides?" });
  await deckBox.getByLabel("google slides link").fill("https://example.com/my-sale");
  await deckBox.getByRole("button", { name: "read my slides" }).click();
  check(await seen(deckBox.getByText(/isn't a Google Slides link/)), "the sell page refuses a link that isn't a slides deck");
  await deckBox.getByLabel("google slides link").fill(`https://docs.google.com/presentation/d/${TEST_DECK}/edit?usp=sharing`);
  await deckBox.getByRole("button", { name: "read my slides" }).click();
  check(await seen(deckBox.getByText(/already on TigerRetail, under someone else's name/)), "…and someone else's deck");
  await shot(buyer, "06-sell-deck-box");
  await buyer.goto(`${URL}/listings/${jacket.id}`);
  check(await seen(buyer.getByText(/draft from your slides/)), "a draft from your own deck opens for you, marked as a draft");
  await visitor.goto(`${URL}/listings/${jacket.id}`);
  check(await seen(visitor.getByText("This page could not be found")), "…and for no one else");
  await admin.goto(`${URL}/admin/imports`);
  check(!(await admin.getByText("e2e jean jacket").count()), "a seller's own deck stays out of the admin queue");
  // ---- editing a listing ----
  await buyer.goto(`${URL}/listings/${jacket.id}`);
  await buyer.getByRole("link", { name: "edit listing" }).click();
  await buyer.waitForURL(`${URL}/listings/${jacket.id}/edit`);
  check(await seen(buyer.getByRole("heading", { name: "edit listing" })), "a seller can open their listing to edit it");
  check((await buyer.getByLabel("item name").inputValue()) === "e2e jean jacket" && (await buyer.getByLabel("price").inputValue()) === "25", "…filled in with what's there");
  await buyer.getByLabel("item name").fill("e2e denim jacket");
  await buyer.getByLabel("price").fill("22.50");
  await buyer.locator('input[type=file][aria-label="photos for item 1"]').setInputFiles({ name: "back.png", mimeType: "image/png", buffer: png });
  await buyer.waitForTimeout(800);
  await shot(buyer, "09-edit-listing");
  await buyer.getByRole("button", { name: "save changes" }).click();
  await buyer.waitForURL(`${URL}/listings/${jacket.id}`);
  check(await seen(buyer.getByRole("heading", { name: "e2e denim jacket" })), "saving shows the listing with the new name");
  const [edited] = await db`select title, price_cents, photo_paths, size, status from listings where id = ${jacket.id}`;
  check(edited.price_cents === 2250 && edited.photo_paths.length === 2 && edited.photo_paths[0] === photo, "…new price, the new photo added after the cover");
  check(edited.size === "x-small–small" && edited.status === "review", "…an untouched size is kept as it was, and a draft stays a draft");
  await visitor.goto(`${URL}/listings/${jacket.id}/edit`);
  check(await visitor.waitForURL(/\/login/, { timeout: 15_000 }).then(() => true, () => false), "signed out, the edit page sends you to sign in");
  await admin.goto(`${URL}/listings/${jacket.id}/edit`);
  check(await seen(admin.getByText("This page could not be found")), "…and anyone else, even an admin, gets 'not found' for a seller's own listing");
  const added = edited.photo_paths.filter((p) => p !== photo);
  await db`update listings set photo_paths = ${db.array([photo])} where id = ${jacket.id}`; // keep the e2e photo cleanup simple
  if (added.length) await removePhotos("listing-photos", added); // the photo the edit uploaded

  await buyer.goto(`${URL}/welcome/${ownSrc.id}`);
  check(await seen(buyer.getByRole("heading", { name: "your slides, ready to post" })), "the seller checks what was read from their slides");
  check(await seen(buyer.getByText(/skipped: 1 marked sold/)), "…including what was skipped");
  await shot(buyer, "07-own-deck-review");
  await buyer.locator(".card", { hasText: "e2e plaid scarf" }).getByRole("button", { name: "take down" }).click();
  check(await seen(buyer.getByRole("button", { name: "post it" })), "taking one down leaves the rest to post");
  await buyer.getByRole("button", { name: "post it" }).click();
  check(await seen(buyer.getByText(/^posted\./)), "one tap posts them");
  const own = await db`select id, status from listings where import_source_id = ${ownSrc.id}`;
  check(own.length === 1 && own[0].id === jacket.id && own[0].status === "active" && !own.some((r) => r.id === scarf.id), "…the kept one is live, the taken-down one is gone");
  await visitor.goto(`${URL}/listings/${jacket.id}`);
  check(await seen(visitor.getByRole("heading", { name: "e2e denim jacket" })), "…and anyone can see it");

  // ---- people's pages ----
  await visitor.locator("p.attr", { hasText: "posted by" }).getByRole("link").click();
  await visitor.waitForURL(`${URL}/u/${BUYER}`);
  check(await seen(visitor.getByRole("heading", { name: BUYER })), "clicking who posted it opens their page");
  check(await seen(visitor.locator("a.card", { hasText: "e2e denim jacket" })), "…with what they're selling");
  check(await seen(visitor.getByText("lives in Wilf Hall")), "…and their dorm");
  check(!(await visitor.getByText("609-555-0404").count()) && !(await visitor.getByText(`@${BUYER}`).count()), "…but never their phone or payment handles");
  await shot(visitor, "11-person-page");
  await visitor.goto(`${URL}/u/listserv`);
  check(await seen(visitor.getByText("This page could not be found")), "the listserv account has no page");
  await visitor.goto(`${URL}/u/nobody-here-123`);
  check(await seen(visitor.getByText("This page could not be found")), "…nor does a netid that isn't a user");

  // ---- the poster follows the invite: claims the sale, takes an item down ----
  const poster = await as(browser, POSTER);
  await poster.goto(`${URL}/sell`);
  await poster.getByLabel("google slides link").fill(`https://docs.google.com/presentation/d/${TEST_DECK}/edit`);
  await poster.getByRole("button", { name: "read my slides" }).click();
  await poster.waitForURL(`${URL}/welcome/${src.id}`);
  check(true, "pasting a deck the listserv import already found takes its poster to that sale");
  await poster.goto(`${URL}/listings/${tank.id}`);
  await poster.getByRole("link", { name: /this is my sale/ }).click();
  await poster.waitForURL(`${URL}/welcome/${src.id}`);
  check(await seen(poster.getByRole("heading", { name: "welcome to TigerRetail, pat" })), "the listing page sends the poster to their sale's welcome page");
  check(await seen(poster.locator(".card", { hasText: "e2e polka dot tank top" })), "…which shows their items");
  await shot(poster, "03-welcome");
  await poster.getByRole("button", { name: /^add (it|them) to my account$/ }).click();
  check(await seen(poster.getByText(/they’re yours/)), "one tap adds the sale to their account");
  const [row] = await db`select seller_netid, status, contact_phone, payments from listings where id = ${tank.id}`;
  check(row.seller_netid === POSTER && row.status === "active", "the listing is now the poster's, and live");
  check(row.contact_phone === POSTED_PHONE && row.payments[0].handle === "@pat-sells", "…still showing the contact details from their post");
  await shot(poster, "03b-welcome-claimed");
  await poster.goto(`${URL}/listings/${tank.id}`);
  check(await seen(poster.getByText(/your listing — 0 offers/)), "on the listing page it's their own listing");
  await buyer.goto(`${URL}/listings/${tank.id}`);
  check(await seen(buyer.getByRole("button", { name: /message seller/ })), "buyers can message them in the app now");
  check(await seen(buyer.getByText("609-555-0199")), "…and still see the phone from the post");
  await poster.goto(`${URL}/me`);
  check(await seen(poster.locator("a.card", { hasText: "e2e polka dot tank top" })), "it's in their my stuff");
  await poster.goto(`${URL}/welcome/${src.id}`);
  await poster.locator(".card", { hasText: "e2e polka dot tank top" }).getByRole("button", { name: "take down" }).click();
  check(await seen(poster.getByText("nothing from this sale is listed anymore.")), "taking an item down removes it from the page");
  check((await db`select id from listings where id = ${tank.id}`).length === 0, "…and from the marketplace");

  // ---- someone who never onboarded follows their invite ----
  const fresh = await as(browser, FRESH);
  await fresh.goto(`${URL}/welcome/${emailSrc.id}`);
  check(fresh.url() === `${URL}/welcome/${emailSrc.id}`, "a first-time seller lands on their sale, not on onboarding");
  const dorm = fresh.getByLabel("where you live (your pin on the map)");
  await dorm.locator("option", { hasText: "Wilf Hall" }).waitFor({ state: "attached", timeout: 30_000 });
  await dorm.selectOption("Wilf Hall");
  await shot(fresh, "10-welcome-dorm");
  await fresh.getByRole("button", { name: /^add (it|them) to my account$/ }).click();
  check(await seen(fresh.getByText(/they’re yours/)), "…and can claim it without setting up a profile");
  const [d] = await db`select seller_netid from listings where id = ${desk.id}`;
  check(d.seller_netid === FRESH, "the desk is now theirs");
  const [u] = await db`select display_name, building from users where netid = ${FRESH}`;
  check(u.display_name === "Frankie Fresh", "their name comes from the sale they posted");
  check(u.building === "Wilf Hall", "…and the dorm they picked is saved, which puts their listings on the map");
  await buyer.goto(`${URL}/welcome/${emailSrc.id}`);
  check(await seen(buyer.getByText(/this sale was posted by someone else/)), "anyone else gets turned away from the welcome page");
} finally {
  await browser.close();
  await cleanup();
}
check(errors.length === 0, `no page errors${errors.length ? `:\n    ${errors.join("\n    ")}` : ""}`);
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
await db.end({ timeout: 2 });
process.exit(failed ? 1 : 0);
