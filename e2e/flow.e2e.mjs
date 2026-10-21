/* End-to-end check of the app against the running dev server and the team
   database and R2 bucket in .env.local. Drives two people through the main flow
   (onboard → sell a batch → browse/filter → offer → accept → contact → sold)
   and screenshots each view.

     npm run dev            (in another terminal)
     npm run e2e            (SHOTS=<dir> to change where screenshots go)

   CAS can't be automated (it's Princeton's real login), so this test signs its
   two users in by sealing a session cookie with SESSION_SECRET, exactly what
   /api/auth/callback does after CAS says yes. That shortcut lives only here.
   The CAS hop itself is checked up to Princeton's door: we assert the redirect
   URL and stop. Test users are netids starting "e2e-" and are deleted at the end. */
import { chromium } from "playwright-core";
import { sealData } from "iron-session";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { db, insert, removePhotos } from "./testdb.mjs";

const URL = process.env.URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? join(homedir(), "Desktop", "UX screenshots", "TigerRetail", "wireframe-match");
mkdirSync(SHOTS, { recursive: true });

const SELLER = "e2e-seller";
const BUYER = "e2e-buyer";
const OTHER = "e2e-other"; // a third person, to prove conversations are private

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failed++;
};
/* isVisible() doesn't wait; parts of each page stream in behind Suspense. */
const seen = (locator, ms = 15_000) => locator.first().waitFor({ timeout: ms }).then(() => true, () => false);
/* Full-page shots: start from the top (the nav is sticky, so a scrolled page
   draws it mid-image) and let lazy photos finish loading first. */
const shot = async (page, name) => {
  const path = join(SHOTS, `${name}.png`);
  // let React finish hydrating before touching the DOM, or it flags our edits as a mismatch
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    const imgs = [...document.querySelectorAll("img")].filter((i) => i.offsetParent !== null);
    imgs.forEach((i) => (i.loading = "eager"));
    await Promise.race([
      Promise.all(imgs.map((i) => (i.complete ? null : new Promise((done) => i.addEventListener("load", done, { once: true }) || i.addEventListener("error", done, { once: true }))))),
      new Promise((done) => setTimeout(done, 8000)),
    ]);
  });
  await page.screenshot({ path, fullPage: true, caret: "initial" });
  console.log(`  📸 ${path}`);
};

async function cleanup() {
  const people = [SELLER, BUYER, OTHER];
  const listings = await db`select photo_paths from listings where seller_netid in ${db(people)}`;
  const avatars = (await db`select avatar_path from users where netid in ${db(people)} and avatar_path is not null`).map((u) => u.avatar_path);
  await db`delete from users where netid in ${db(people)}`; // cascades to listings, offers, conversations
  // rows first, photos last: a run killed midway leaves unused photos, never broken listings
  const photos = listings.flatMap((l) => l.photo_paths);
  if (photos.length) await removePhotos("listing-photos", photos);
  if (avatars.length) await removePhotos("avatars", avatars);
}

async function signedInContext(browser, netid, viewport = { width: 1280, height: 860 }) {
  const ctx = await browser.newContext({ viewport });
  const seal = await sealData({ netid }, { password: process.env.SESSION_SECRET, ttl: 60 * 60 * 24 * 14 });
  await ctx.addCookies([{ name: "tr_session", value: seal, url: URL, httpOnly: true, sameSite: "Lax" }]);
  return ctx;
}

/* a real PNG: screenshot of a coloured box */
async function makePhoto(ctx, from, to) {
  const p = await ctx.newPage();
  await p.setContent(`<div style="width:480px;height:600px;background:linear-gradient(135deg,${from},${to})"></div>`);
  const buf = await p.locator("div").screenshot();
  await p.close();
  return buf;
}

const errors = [];
function watch(page, who) {
  page.on("pageerror", (e) => errors.push(`${who} pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${who} console: ${m.text()}`));
  return page;
}

await cleanup(); // leftovers from an aborted run
const browser = await chromium.launch({ channel: "chrome" });
try {
  // ---- 1. a visitor browses, then tries to sell ----
  const visitor = watch(await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage(), "visitor");
  await visitor.goto(URL);
  await visitor.waitForURL(/\/browse\?cat=clothing/);
  check(await seen(visitor.locator(".chipbtn.on:visible", { hasText: "all clothing" })), "/ opens on the clothing section (no home page)");
  const here = visitor.locator(".cat-btn[aria-current=page]");
  check((await here.textContent()) === "clothing", "clothing is marked as the current section");
  const style = await here.evaluate((el) => ({ w: getComputedStyle(el).fontWeight, d: getComputedStyle(el).textDecorationLine }));
  check(Number(style.w) >= 600 && style.d.includes("underline"), `current section is bold + underlined (${style.w}, ${style.d})`);
  check(await seen(visitor.getByRole("link", { name: "sign in" })), "visitor sees 'sign in' in the nav");
  await shot(visitor, "01-clothing-visitor");

  await visitor.getByRole("link", { name: "+ sell" }).or(visitor.locator("a.pill-sell")).first().click();
  await visitor.waitForURL(/\/login\?next=%2Fsell/);
  check(true, "selling while signed out redirects to /login?next=/sell");
  await shot(visitor, "02-login");

  // Follow the CAS button only as far as Princeton's door.
  const [casRequest] = await Promise.all([
    visitor.waitForRequest((r) => r.url().startsWith("https://fed.princeton.edu/cas/login"), { timeout: 15_000 }),
    visitor.getByRole("link", { name: "Sign in with Princeton CAS" }).click(),
  ]);
  const service = new globalThis.URL(casRequest.url()).searchParams.get("service");
  check(service === `${process.env.APP_URL}/api/auth/callback`, `CAS login carries service=${service}`);
  await visitor.close();

  // ---- 2. callback without a ticket is refused, not trusted ----
  const probe = await fetch(`${URL}/api/auth/callback`, { redirect: "manual" });
  check(probe.status >= 300 && probe.status < 400 && probe.headers.get("location")?.includes("/login?error=missing_ticket"), "callback with no ticket bounces to /login");
  const bogus = await fetch(`${URL}/api/auth/callback?ticket=ST-not-real`, { redirect: "manual" });
  check(bogus.headers.get("location")?.includes("/login?error="), `callback with a fake ticket is rejected by CAS (${bogus.headers.get("location")})`);

  // ---- 3. seller: first login → onboarding ----
  await insert("users", { netid: SELLER }); // what ensureUser() does on first CAS login
  const sctx = await signedInContext(browser, SELLER);
  const seller = watch(await sctx.newPage(), "seller");
  await seller.goto(`${URL}/sell`);
  await seller.waitForURL(/\/onboarding\?next=%2Fsell/);
  check(true, "un-onboarded seller is sent to onboarding first");
  await seller.locator("#pf-building option[value='1976 Hall']").waitFor({ state: "attached", timeout: 30_000 });
  check(true, "building list loaded from Princeton's Buildings layer");
  await shot(seller, "03-onboarding");

  // passes the browser's `required` check, fails the server's rules
  await seller.locator("#pf-phone:visible").fill("555");
  await seller.locator("input[name=pay][value=\'venmo\']:visible").check();
  await seller.locator("#pf-building:visible").selectOption("1976 Hall");
  await seller.getByRole("button", { name: "start browsing" }).click();
  check(await seen(seller.getByText("Enter a 10-digit US phone number.")), "server rejects a bad phone");
  check(await seen(seller.getByText("Add venmo details so buyers know where to send it.")), "server rejects venmo without a handle");
  await seller.locator("#pf-phone:visible").fill("609-555-0101");
  await seller.locator("input[name=pay][value=\'venmo\']:visible").check();
  await seller.getByLabel("venmo details").fill("@e2e-seller");
  await seller.locator("#pf-building:visible").selectOption("1976 Hall");
  await seller.locator("#pf-room:visible").fill("2nd floor, two lefts");
  await seller.getByRole("button", { name: "start browsing" }).click();
  await seller.waitForURL(`${URL}/sell`);
  check(true, "onboarding returns the seller to /sell");

  // ---- 4. sell: photos first ----
  check(await seen(seller.getByRole("heading", { name: "what are you selling?" })), "selling opens on photos, not contact details");
  const line = seller.locator(".contactline:visible");
  check(await seen(line), "contact is one summary line");
  const lineText = await line.textContent();
  check(lineText.includes("e2e-seller@princeton.edu") && lineText.includes("609-555-0101") && lineText.includes("venmo"), `summary comes from onboarding (${lineText.trim()})`);
  check(await seller.getByRole("button", { name: /publish listing/ }).isDisabled(), "publish is disabled until an item has a photo, name and price");

  await line.getByRole("button", { name: "change" }).click();
  await seller.getByLabel("pickup and try-on instructions").fill("meet at the 1976 hall courtyard most evenings");
  await seller.locator("input[name=pay][value='cash']:visible").check();
  await shot(seller, "04-sell-contact-open");
  await seller.getByRole("button", { name: "done" }).click();
  check((await seller.locator(".contactline:visible").textContent()).includes("venmo · cash · meet at the 1976 hall courtyard"), "changes show in the summary line");

  const photoA = await makePhoto(sctx, "#2F6DB5", "#9ec1ea");
  const photoB = await makePhoto(sctx, "#1e3a5f", "#4a6f9a");
  const photoC = await makePhoto(sctx, "#BB4C19", "#f2c14e");
  const photoD = await makePhoto(sctx, "#3F7D52", "#b5d3a8");

  // three photos dropped at once → three item cards
  await seller.getByLabel("photos for new items").setInputFiles([
    { name: "jeans-front.png", mimeType: "image/png", buffer: photoA },
    { name: "lamp.png", mimeType: "image/png", buffer: photoC },
    { name: "extra.png", mimeType: "image/png", buffer: photoD },
  ]);
  await seller.locator(".itemcard:visible").nth(2).waitFor();
  check((await seller.locator(".itemcard:visible").count()) === 3, "each photo became its own item card");

  const card1 = seller.locator(".itemcard:visible").nth(0);
  await card1.getByLabel("photos for item 1").setInputFiles([{ name: "jeans-back.png", mimeType: "image/png", buffer: photoB }]);
  await card1.locator(".shot img").nth(1).waitFor();
  check((await card1.locator(".shot").count()) === 2, "a second angle added to the jeans card, first stays the cover");
  await card1.getByLabel("item name").fill("e2e levi's 501 jeans");
  await card1.getByLabel("price").fill("25");
  check((await card1.getByLabel("subcategory").inputValue()) === "bottoms", "naming it 'jeans' picks clothing / bottoms");
  check(await seen(card1.getByText("guessed from “jeans”")), "the guess says what it went on");
  await card1.getByLabel("waist").selectOption("32");
  await card1.getByLabel("length").selectOption("30");
  check((await card1.getByLabel("condition").count()) === 0, "details are folded away by default");
  await card1.getByRole("button", { name: /add details/ }).click();
  await card1.getByLabel("department").selectOption("men's");
  await card1.getByLabel("condition").selectOption("<5 wears");
  await card1.getByLabel("brand").fill("levi's");
  await card1.getByRole("switch", { name: "allow try-on requests" }).click();
  await card1.getByLabel("description").fill("barely worn, 32x30");

  const card2 = seller.locator(".itemcard:visible").nth(1);
  await card2.getByLabel("item name").fill("e2e desk lamp");
  await card2.getByLabel("price").fill("10");
  check((await card2.getByLabel("category", { exact: true }).inputValue()) === "dorm" && (await card2.getByLabel("subcategory").inputValue()) === "essentials", "naming it 'desk lamp' picks dorm / essentials");
  check((await card2.getByLabel("size").count()) === 0 && (await card2.getByLabel("waist").count()) === 0, "dorm items ask for no size");
  await card2.getByRole("button", { name: /add details/ }).click();
  check((await card2.getByLabel("department").count()) === 0, "dorm items have no department");
  await card2.getByLabel("brand").fill("ikea");

  await seller.locator(".itemcard:visible").nth(2).getByRole("button", { name: "remove", exact: true }).click();
  check((await seller.locator(".itemcard:visible").count()) === 2, "an item card can be removed");
  await shot(seller, "05-sell-items");

  await seller.getByRole("button", { name: "publish listings" }).click();
  check(await seen(seller.getByText("congrats! your listings are now live."), 60_000), "batch published");
  check(await seen(seller.getByText("2 items in this batch")), "both items went up");
  await shot(seller, "06-sell-live");
  const jeansUrl = URL + (await seller.locator("a.card:visible", { hasText: "e2e levi's 501 jeans" }).getAttribute("href"));

  // ---- 5b. seller: profile ----
  await seller.locator("a.me-link:visible").click();
  await seller.waitForURL(`${URL}/profile`);
  check(true, "the nav avatar opens your profile");
  check((await seller.locator("#pf-phone:visible").inputValue()) === "609-555-0101", "profile shows your phone from onboarding");
  check((await seller.getByLabel("venmo details").filter({ visible: true }).inputValue()) === "@e2e-seller", "profile shows your venmo handle");
  await seller.locator("#pf-building:visible option[value='1976 Hall']").waitFor({ state: "attached", timeout: 30_000 });
  check((await seller.locator("#pf-building:visible").inputValue()) === "1976 Hall", "profile shows where you live");
  await shot(seller, "06b-profile-before");

  await seller.getByLabel("profile photo").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: await makePhoto(sctx, "#C2417A", "#f4c4d8") });
  check(await seen(seller.locator(".avatar-edit:visible .avatar img")), "profile photo uploads right away");
  check(await seen(seller.locator("a.me-link:visible .avatar img")), "the nav avatar shows the new photo");
  await seller.locator("#pf-name:visible").fill("Sam Seller");
  await seller.locator("#pf-bio:visible").fill("selling everything before i move out");
  await seller.getByLabel("venmo details").filter({ visible: true }).fill("@sam-sells");
  await seller.locator("#pf-building:visible").selectOption("Bloomberg Hall");
  await seller.getByRole("button", { name: "save profile" }).click();
  await seller.waitForURL(/\/profile\?saved=1/);
  check(await seen(seller.getByText("people see you as Sam Seller")), "saved: you now show up by name");
  check(!(await seller.locator("#pf-year").count()), "there's no class year to fill in");
  await seller.reload();
  await seller.locator("#pf-building:visible option[value='Bloomberg Hall']").waitFor({ state: "attached", timeout: 30_000 });
  check((await seller.locator("#pf-bio:visible").inputValue()) === "selling everything before i move out", "bio saved");
  check((await seller.getByLabel("venmo details").filter({ visible: true }).inputValue()) === "@sam-sells", "new venmo handle saved");
  check((await seller.locator("#pf-building:visible").inputValue()) === "Bloomberg Hall", "new dorm saved");
  await shot(seller, "06c-profile-after");
  const settings = await fetch(`${URL}/settings`, { redirect: "manual" });
  check(settings.headers.get("location")?.endsWith("/profile"), "old /settings links land on the profile");

  // ---- 6. buyer: browse, filter, department, search ----
  await insert("users", {
    netid: BUYER,
    phone: "6095550202",
    payments: [{ id: "zelle", handle: "609-555-0202" }],
    building: "Forbes College Main",
    onboarded_at: new Date().toISOString(),
  });
  const bctx = await signedInContext(browser, BUYER);
  const buyer = watch(await bctx.newPage(), "buyer");
  await buyer.goto(URL);
  check(await seen(buyer.locator("a.card:visible", { hasText: "e2e levi's 501 jeans" })), "new jeans show in clothing");
  check(await seen(buyer.locator("a.card:visible", { hasText: "32 × 30 · straight · levi's" })), "card shows size · brand like the wireframe");
  await shot(buyer, "07-clothing-buyer");

  check((await buyer.locator(".ms-btn:visible", { hasText: "brand" }).count()) === 0, "brand is folded into 'more filters'");
  await buyer.locator(".ms-btn:visible", { hasText: "more filters" }).click();
  await buyer.locator(".ms-opt:visible", { hasText: "levi's" }).click();
  await buyer.waitForURL(/brand=levi/);
  check(await seen(buyer.locator(".ms-btn:visible", { hasText: "more filters" }).locator(".badge", { hasText: "1" })), "'more filters' shows how many are on");
  check(await seen(buyer.locator(".pill:visible", { hasText: "levi's" })), "brand filter shows as a pill");
  await buyer.getByText("loading listings…").waitFor({ state: "detached" });
  const metas = await buyer.locator("a.card:visible .card-meta").allTextContents();
  check(metas.length > 0 && metas.every((m) => m.includes("levi's")), `brand filter leaves only levi's (${metas.length} cards)`);
  await shot(buyer, "08-clothing-filtered");

  // quick clicks all stick; a second click takes one back off
  await buyer.keyboard.press("Escape");
  check((await buyer.locator(".ms-panel:visible").count()) === 0, "Escape closes an open filter menu");
  await buyer.locator(".pill.clear:visible").click();
  await buyer.waitForURL((u) => !u.search.includes("brand="));
  await buyer.locator(".ms-btn:visible", { hasText: "size" }).click();
  const sizeOpts = buyer.locator(".ms-panel:visible .ms-opt");
  const firstThree = (await sizeOpts.allTextContents()).slice(0, 3);
  for (const i of [0, 1, 2]) await sizeOpts.nth(i).click();
  await buyer.waitForURL((u) => u.searchParams.getAll("size").length === 3);
  check(true, `three quick size clicks all stick (${firstThree.join(", ")})`);
  await sizeOpts.nth(1).click();
  await buyer.waitForURL((u) => u.searchParams.getAll("size").length === 2);
  check(!new globalThis.URL(buyer.url()).searchParams.getAll("size").includes(firstThree[1]), "clicking a picked size again removes it");
  await buyer.keyboard.press("Escape");
  await buyer.locator(".pill.clear:visible").click();
  await buyer.waitForURL((u) => !u.search.includes("size="));

  const chip = (t) => buyer.locator(".chipbtn:visible", { hasText: new RegExp(`^${t}$`) });
  await chip("tops").click();
  await chip("bottoms").click();
  await buyer.waitForURL((u) => u.searchParams.getAll("sub").length === 2);
  check((await buyer.locator(".chipbtn.on:visible").allTextContents()).join() === "tops,bottoms", "subcategory chips multi-select");
  await chip("tops").click();
  await buyer.waitForURL((u) => u.searchParams.getAll("sub").join() === "bottoms");
  check(true, "clicking a picked chip again unselects it");
  await shot(buyer, "08b-clothing-bottoms");

  await buyer.locator(".cat-btn:visible", { hasText: "dorm" }).click();
  await buyer.waitForURL(/\/browse\?cat=dorm/);
  check((await buyer.locator(".cat-btn[aria-current=page]:visible").textContent()) === "dorm", "dorm is marked as the current section");
  check(await seen(buyer.locator("a.card:visible", { hasText: "e2e desk lamp" })), "dorm shows the lamp");
  check((await buyer.locator(".seg[aria-label=department]:visible").count()) === 0, "dorm has no department switch");
  await shot(buyer, "09-browse-dorm");

  await buyer.locator(".cat-btn:visible", { hasText: "clothing" }).click();
  await buyer.waitForURL(/\/browse\?cat=clothing$/);
  const deptSwitch = buyer.locator(".seg[aria-label=department]:visible");
  await deptSwitch.getByRole("button", { name: "women", exact: true }).click();
  await buyer.waitForURL(/cat=clothing.*dept=women/);
  const onBtn = deptSwitch.locator("button[aria-pressed=true]");
  check((await onBtn.textContent()) === "women", "the department switch shows women as selected");
  await buyer.getByText("loading listings…").waitFor({ state: "detached" });
  check(!(await buyer.locator("a.card:visible", { hasText: "e2e levi's 501 jeans" }).count()), "women's clothing hides men's jeans");
  await shot(buyer, "09b-department-women");
  await deptSwitch.getByRole("button", { name: "men", exact: true }).click();
  check(await seen(buyer.locator("a.card:visible", { hasText: "e2e levi's 501 jeans" })), "men's clothing shows the jeans");
  await buyer.locator(".cat-btn:visible", { hasText: "dorm" }).click();
  await buyer.waitForURL(/cat=dorm.*dept=men/);
  check(true, "the department follows you to other sections");
  await buyer.locator(".cat-btn:visible", { hasText: "clothing" }).click();
  await buyer.waitForURL(/cat=clothing.*dept=men/);
  await shot(buyer, "10-browse-clothing-men");

  // list | map inside the section
  await buyer.locator(".seg[aria-label=view]:visible").getByRole("button", { name: "map" }).click();
  await buyer.waitForURL(/view=map/);
  await buyer.locator(".esri-view-surface").waitFor({ timeout: 30_000 });
  check((await buyer.locator("a.card:visible").count()) === 0, "map view swaps the list for the campus map");
  await buyer.waitForTimeout(3000);
  await shot(buyer, "10b-clothing-map");
  await buyer.locator(".seg[aria-label=view]:visible").getByRole("button", { name: "list" }).click();
  await buyer.waitForURL((u) => !u.search.includes("view=map"));

  await buyer.getByLabel("search listings").fill("desk lamp");
  await buyer.getByLabel("search listings").press("Enter");
  await buyer.waitForURL(/q=desk/);
  check(await seen(buyer.locator("a.card:visible", { hasText: "e2e desk lamp" })), "search finds the lamp");

  // ---- 7. offer → accept → contact ----
  await buyer.goto(jeansUrl);
  check(await seen(buyer.getByRole("heading", { name: "e2e levi's 501 jeans" })), "listing page loads");
  check(await seen(buyer.getByText("try-ons allowed · size 32 × 30 · straight")), "try-on + size line");
  check(await seen(buyer.locator(".paytag:visible", { hasText: "venmo" })), "accepts shows payment methods");
  check(await buyer.locator(".thumbs button:visible").count() === 2, "both photos are on the listing");
  check(!(await buyer.getByText("609-555-0101").filter({ visible: true }).count()), "seller's phone is hidden before an accepted offer");
  check(await seen(buyer.locator(".person:visible", { hasText: "Sam Seller" }).locator(".avatar img")), "listing shows the seller's name and photo");
  await shot(buyer, "11-listing-buyer");

  await buyer.getByRole("button", { name: "make an offer" }).click();
  const amounts = await buyer.locator(".amts:visible button").allTextContents();
  check(amounts.join("|") === "$25asking|$23−10%|$20−20%|other", `one-tap amounts: ${amounts.join(" / ")}`);
  await buyer.locator(".amts:visible button", { hasText: "−20%" }).click();
  check(await seen(buyer.getByRole("button", { name: "send $20 offer" })), "the send button names the amount");
  await buyer.locator(".amts:visible button", { hasText: "other" }).click();
  await buyer.getByLabel("your offer ($)").fill("20");
  await buyer.getByLabel("note to the seller").fill("can pick up tonight");
  await shot(buyer, "11b-offer-panel");
  await buyer.getByRole("button", { name: "send $20 offer" }).click();
  check(await seen(buyer.getByText("offer sent.")), "buyer's offer is sent");
  await buyer.reload();
  check(await seen(buyer.getByText("your offer:")), "buyer sees their pending offer");

  // ---- 7b. messaging ----
  await buyer.getByRole("button", { name: "message seller" }).click();
  await buyer.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
  const threadUrl = buyer.url();
  check(await seen(buyer.locator(".convo-item:visible", { hasText: "e2e levi's 501 jeans" })), "the conversation shows which item it's about");
  check(await seen(buyer.locator(".convo-head:visible", { hasText: "Sam Seller" })), "…and who you're talking to");
  await buyer.getByLabel("message").fill("hi! are these still available?");
  await buyer.getByLabel("message").press("Enter");
  check(await seen(buyer.locator(".msg.mine:visible", { hasText: "are these still available?" })), "enter sends; your message shows right away");

  await seller.goto(`${URL}/browse?cat=dorm`); // any page: the nav checks for unread on navigation
  check(await seen(seller.locator("a.icon-lbl:visible", { hasText: "messages" }).locator(".badge", { hasText: "1" }), 25_000), "seller's nav shows 1 unread");
  await seller.locator("a.icon-lbl:visible", { hasText: "messages" }).click();
  await seller.waitForURL(`${URL}/messages`);
  const row = seller.locator(".inbox-row.unread:visible", { hasText: "e2e-buyer" });
  check(await seen(row), "inbox lists the conversation as unread");
  check((await row.textContent()).includes("are these still available?"), "inbox previews the last message");
  await shot(seller, "11c-inbox");
  await row.click();
  await seller.waitForURL(threadUrl);
  check(await seen(seller.locator(".msg.theirs:visible", { hasText: "are these still available?" })), "seller reads the buyer's message");
  await seller.locator("a.icon-lbl:visible", { hasText: "messages" }).locator(".badge").waitFor({ state: "detached", timeout: 10_000 }).then(
    () => check(true, "opening the conversation clears the nav badge"),
    () => check(false, "opening the conversation clears the nav badge"),
  );
  await seller.getByLabel("message").fill("yes! want to try them on tonight?");
  await seller.getByRole("button", { name: "send" }).click();
  check(await seen(seller.locator(".msg.mine:visible", { hasText: "try them on tonight" })), "seller's reply shows right away");
  await shot(seller, "11d-conversation-seller");

  // the buyer never reloaded: the reply arrives by polling
  check(await seen(buyer.locator(".msg.theirs:visible", { hasText: "try them on tonight" }), 15_000), "buyer's open conversation gets the reply without a reload");
  await shot(buyer, "11e-conversation-buyer");

  await seller.goto(`${URL}/messages`);
  check(!(await seller.locator(".inbox-row.unread:visible").count()), "once read, nothing is unread for the seller");
  check(!(await seller.locator("a.icon-lbl:visible", { hasText: "messages" }).locator(".badge").count()), "…and the nav badge is gone");

  // seller can open the same conversation from the offer, and a stranger can't see it at all
  await seller.goto(jeansUrl);
  await seller.getByRole("button", { name: "message e2e-buyer" }).click();
  await seller.waitForURL(threadUrl);
  check(true, "the seller's 'message' on an offer opens the same conversation");
  await insert("users", { netid: OTHER, phone: "6095550303", payments: [{ id: "cash", handle: "" }], building: "Wilf Hall", onboarded_at: new Date().toISOString() });
  const octx = await signedInContext(browser, OTHER);
  const other = watch(await octx.newPage(), "other");
  await other.goto(threadUrl);
  // the page streams, so the status is already sent; what matters is what they see
  check(await seen(other.getByText("This page could not be found")), "someone outside the conversation gets 'not found'");
  check(!(await other.getByText("are these still available?").count()), "…and none of the messages");
  await octx.close();
  await buyer.goto(jeansUrl);

  await seller.goto(jeansUrl);
  check(await seen(seller.locator(".offrow:visible", { hasText: "e2e-buyer" })), "seller sees the offer");
  check(await seen(seller.getByText("your listing — 1 offer · highest $20")), "seller sees the offer count and the highest");
  await shot(seller, "12-listing-seller-offer");
  await seller.getByRole("button", { name: "accept" }).click();
  check(await seen(seller.getByText("609-555-0202")), "after accepting, seller sees the buyer's phone");
  await shot(seller, "13-listing-seller-accepted");

  await buyer.reload();
  check(await seen(buyer.getByText("accepted your $20 offer")), "buyer is told the offer was accepted");
  check(!(await buyer.getByText(/highest/).filter({ visible: true }).count()), "buyers never see the highest offer");
  check(await seen(buyer.getByText("609-555-0101")), "buyer now sees the seller's phone");
  check(await seen(buyer.getByText("venmo @sam-sells · cash")), "buyer sees the seller's current venmo handle (changed on profile after posting)");
  check(await seen(buyer.getByText("Bloomberg Hall · 2nd floor, two lefts · meet at the 1976 hall courtyard most evenings")), "buyer sees building (updated on profile), directions, pickup note");
  check(await seen(buyer.getByText("seller: Sam Seller")), "contact card names the seller");
  await shot(buyer, "14-listing-buyer-accepted");

  await buyer.goto(`${URL}/me`);
  check(await seen(buyer.locator(".offercard:visible", { hasText: "accepted" })), "buyer's my stuff lists the accepted offer");
  await shot(buyer, "15-my-stuff-buyer");

  // ---- 8. the listings are on the map ----
  await buyer.locator("a.icon-lbl:visible", { hasText: "map" }).click();
  await buyer.waitForURL(`${URL}/map`);
  check(true, "the nav's map link opens the campus map");
  await buyer.locator(".esri-view-surface").waitFor({ timeout: 30_000 });
  await buyer.waitForTimeout(4000); // tiles + pins
  await shot(buyer, "16-map");

  // ---- 9. seller marks the jeans sold ----
  await seller.getByRole("button", { name: "mark as sold" }).click();
  await seller.getByRole("button", { name: "mark as sold" }).waitFor({ state: "detached" });
  await seller.goto(URL);
  await seller.getByText("loading listings…").waitFor({ state: "detached" });
  check(!(await seller.locator("a.card:visible", { hasText: "e2e levi's 501 jeans" }).count()), "sold listing leaves the feed");

  // ---- 10. phone width ----
  const mctx = await signedInContext(browser, SELLER, { width: 390, height: 844 });
  const mobile = watch(await mctx.newPage(), "mobile");
  for (const [path, name] of [["/", "17-clothing-mobile"], ["/sell", "18-sell-mobile"], [new globalThis.URL(jeansUrl).pathname, "19-listing-mobile"]]) {
    await mobile.goto(URL + path);
    await mobile.waitForTimeout(1500);
    check(await mobile.evaluate(() => document.documentElement.scrollWidth <= 390), `${path} has no horizontal scroll at 390px`);
    await shot(mobile, name);
  }
} finally {
  await browser.close();
  await cleanup();
}

const realErrors = errors.filter((e) => !/favicon|Download the React DevTools/.test(e));
if (realErrors.length) writeFileSync(join(SHOTS, "page-errors.txt"), realErrors.join("\n\n-----\n\n"));
check(realErrors.length === 0, `no page errors${realErrors.length ? `:\n    ${realErrors.join("\n    ")}` : ""}`);
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
await db.end({ timeout: 2 });
process.exit(failed ? 1 : 0);
