/* End-to-end check of the campus map against the running dev server, using
   the system Chrome. Asserts each step of the browse flow and saves a
   screenshot of every view.

     npm run dev            (in another terminal)
     npm run e2e            (SHOTS=<dir> to change where screenshots go)
*/
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const URL = process.env.URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? join(homedir(), "Desktop", "UX screenshots", "TigerRetail", "map");
mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failed++;
};
const shot = async (page, name) => {
  const path = join(SHOTS, `${name}.png`);
  await page.screenshot({ path });
  console.log(`  📸 ${path}`);
};

const browser = await chromium.launch({ channel: "chrome" });
const errors = [];

async function open(viewport) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  await page.goto(URL);
  await page.locator("[class*=banner]").filter({ hasText: "across campus" }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500); // let tiles finish drawing
  return page;
}

/* zoom one level at a time with the map's own + button (double-clicking would
   also click whatever cluster is under the cursor) */
async function zoomIn(page, times = 1) {
  for (let i = 0; i < times; i++) {
    await page.locator('calcite-button[title="Zoom in"]').click();
    await page.waitForTimeout(1300);
  }
  await page.waitForTimeout(1200);
}
async function zoomOut(page, times = 1) {
  for (let i = 0; i < times; i++) {
    await page.locator('calcite-button[title="Zoom out"]').click();
    await page.waitForTimeout(1300);
  }
  await page.waitForTimeout(1200);
}

/* Photo pins are drawn by ArcGIS on the map canvas; the shown ones are
   mirrored as keyboard buttons, which is how this script finds and opens them. */
const photoPins = (page) => page.getByRole("list", { name: "Sellers with matching items on the map" }).getByRole("button");
const multiPins = (page) => photoPins(page).filter({ hasText: /matching items$/ });
async function press(locator) {
  await locator.focus();
  await locator.page().keyboard.press("Enter");
}

/* drag the stress slider and wait until the map reports that many items */
async function setListings(page, n) {
  const t0 = Date.now();
  await page.getByLabel("Demo listings").fill(String(n));
  await page.locator("aside[aria-label='Map filters']").getByText(new RegExp(`· ${n} items`)).waitFor({ timeout: 15_000 });
  return Date.now() - t0;
}

// ---------------- desktop ----------------
{
  const page = await open({ width: 1440, height: 900 });

  const banner = await page.locator("[class*=banner]").textContent();
  check(/\d+ items across campus/.test(banner), `heat view banner: "${banner.trim()}"`);
  check((await photoPins(page).count()) === 0, "no photo pins at campus scale");
  await shot(page, "01-heatmap-campus");

  await zoomIn(page, 2);
  const banner2 = await page.locator("[class*=banner]").textContent();
  check(/Filter by what you want/.test(banner2), `dots view banner: "${banner2.trim()}"`);
  check((await photoPins(page).count()) === 0, "still no photo pins without an item filter");
  await shot(page, "02-seller-dots");

  await page.getByRole("button", { name: "clothing", exact: true }).click();
  await page.waitForTimeout(800);
  await shot(page, "03-filter-clothing-dots");

  await zoomIn(page, 1);
  const pins = photoPins(page);
  await pins.first().waitFor({ timeout: 15_000 });
  const nPins = await pins.count();
  check(nPins > 0, `photo pins appear when zoomed in with a filter (${nPins})`);
  const multi = multiPins(page);
  check((await multi.count()) > 0, "at least one multi-item (carousel) pin");
  await shot(page, "04-photo-pins");

  // pins are drawn by the map itself: drag the map and they must stay on their dots
  const stage = await page.locator("[class*=stage]").first().boundingBox();
  await page.mouse.move(stage.x + 500, stage.y + 450);
  await page.mouse.down();
  await page.mouse.move(stage.x + 420, stage.y + 390, { steps: 6 });
  await shot(page, "04b-photo-pins-mid-drag");
  await page.mouse.up();
  await page.waitForTimeout(800);

  // the pop-out gallery
  await press(multi.first());
  const gallery = page.getByRole("dialog");
  await gallery.waitFor();
  check((await photoPins(page).count()) === 0, "other photo pins hide while a gallery is open");
  const gtext = await gallery.textContent();
  check(/match your filters|items for sale/.test(gtext), "gallery shows matching-item count");
  check(/Room directions are shared once|Room directions:/.test(gtext), "gallery shows room-directions privacy state");
  const thumbs = await gallery.locator("img").count();
  check(thumbs > 1, `gallery shows the seller's items (${thumbs})`);
  const panelBox = await page.getByLabel("Nearby and directions").boundingBox();
  const gBox = await gallery.boundingBox();
  check(gBox.x + gBox.width <= panelBox.x || gBox.y >= panelBox.y + panelBox.height, "gallery doesn't open underneath the side panel");
  await page.waitForTimeout(400);
  await shot(page, "05-gallery-popout");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  check((await page.getByRole("dialog").count()) === 0, "Escape closes the gallery");
  await page.waitForTimeout(1500);
  check((await pins.count()) > 0, "photo pins come back after closing");

  // nearby
  await page.getByLabel("YOU'RE AT").selectOption("1976 Hall");
  await page.waitForTimeout(400);
  const rows = page.locator("[class*=nearrow]");
  check((await rows.count()) > 0, `nearby list fills in (${await rows.count()} sellers)`);
  await shot(page, "06-nearby");

  // walking directions from a seller's gallery
  await rows.last().click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Walk here" }).click();
  const summary = page.locator("[class*=summary]");
  await summary.waitFor({ timeout: 20_000 }).catch(() => {});
  const stext = (await summary.count()) ? await summary.textContent() : "";
  check(/\d+ min/.test(stext), `walking route solved: "${stext.trim()}"`);
  check((await page.locator("[class*=steps] li").count()) > 2, "turn-by-turn steps listed");
  await page.waitForTimeout(1500);
  await shot(page, "07-walking-directions");

  await page.close();
}

// ---------------- filter sidebar: collapsing and grouping ----------------
{
  const page = await open({ width: 1440, height: 900 });
  const panel = page.getByRole("complementary", { name: "Map filters" });

  await panel.getByRole("button", { name: "clothing", exact: true }).click();
  await panel.getByRole("button", { name: "accessories", exact: true }).click();
  const clothingTypes = panel.getByRole("group", { name: "clothing" });
  const accessoryTypes = panel.getByRole("group", { name: "accessories" });
  check((await clothingTypes.getByRole("button").allTextContents()).join(",") === "tops,bottoms,dresses/rompers,outerwear,shoes", "clothing types grouped under 'clothing'");
  check((await accessoryTypes.getByRole("button").allTextContents()).includes("jewelry"), "accessory types grouped separately under 'accessories'");

  await panel.getByRole("button", { name: /^Butler/ }).click();
  await panel.getByRole("button", { name: /^Forbes/ }).click();
  const butler = await panel.getByRole("group", { name: "Butler College halls" }).getByRole("button").allTextContents();
  const forbes = await panel.getByRole("group", { name: "Forbes College halls" }).getByRole("button").allTextContents();
  check(butler.length === 6 && butler.includes("1976 Hall") && !butler.includes("Forbes College Main"), `Butler halls listed under Butler (${butler.length})`);
  check(forbes.length === 2 && forbes.includes("Forbes Courtyard Annex"), `Forbes halls listed under Forbes (${forbes.length})`);
  await shot(page, "18-filters-grouped");

  const what = panel.getByRole("button", { name: /^What/ });
  await what.click();
  check((await what.getAttribute("aria-expanded")) === "false", "What collapses");
  check((await panel.getByRole("button", { name: "clothing", exact: true }).count()) === 0, "collapsed What hides its chips");
  check(/2$/.test((await what.textContent()).trim()), "collapsed What still shows 2 active filters");
  await panel.getByRole("button", { name: /^Where/ }).click();
  const collapsedBtn = await panel.getByRole("button", { name: "Clear all filters" }).boundingBox();
  check(collapsedBtn && collapsedBtn.height < 50, `Clear all stays button-sized with sections collapsed (${Math.round(collapsedBtn?.height ?? 0)}px tall)`);
  await shot(page, "19-filters-collapsed");
  await what.click();
  check((await panel.getByRole("button", { name: "clothing", exact: true }).getAttribute("aria-pressed")) === "true", "re-opening What keeps the selection");

  // Clear all stays on screen however long the sidebar gets, and nothing covers it
  const clearAll = panel.getByRole("button", { name: "Clear all filters" });
  const cb = await clearAll.boundingBox();
  check(cb && cb.y + cb.height <= 900, "Clear all filters is visible without scrolling");
  const onTop = await clearAll.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest("button") === el;
  });
  check(onTop, "nothing covers Clear all filters");
  await page.waitForTimeout(300);
  await shot(page, "20-filters-clear-all");
  await clearAll.click();
  await page.waitForTimeout(300);
  check((await panel.locator("[aria-pressed=true]").count()) === 0, "Clear all filters unpresses every chip");
  check((await clearAll.count()) === 0, "Clear all filters goes away once nothing is filtered");
  check(/· 200 items/.test(await panel.textContent()), "map back to all 200 items");

  // gender filter is the first section of the sidebar; the map key is display-only
  const firstSection = (await panel.locator("section").first().getByRole("button").first().textContent()).trim();
  check(firstSection.startsWith("Gender"), `first sidebar section is Gender ("${firstSection}")`);
  const mens = panel.getByRole("button", { name: "men's", exact: true });
  await mens.click();
  await page.waitForTimeout(300);
  check((await mens.getAttribute("aria-pressed")) === "true", "tapping men's turns it on");
  const filtered = (await panel.locator("[class*=count]").first().textContent()).trim();
  check(!/· 200 items/.test(filtered), `men's filter narrows the map (${filtered})`);
  const key = page.getByLabel("Map key");
  check((await key.getByRole("button").count()) === 0, "map key has no buttons");
  const kb = await key.boundingBox();
  check(kb.height < 32, `map key is a single small line (${Math.round(kb.height)}px tall)`);
  await page.waitForTimeout(300);
  await shot(page, "21-gender-filter-top");
  await panel.getByRole("button", { name: "Clear all filters" }).click();
  await page.waitForTimeout(300);
  check((await mens.getAttribute("aria-pressed")) === "false", "Clear all turns gender off too");

  await page.close();
}

// ---------------- stress: 1000 and 50 listings ----------------
{
  const page = await open({ width: 1440, height: 900 });

  const ms = await setListings(page, 1000);
  check(ms < 5000, `1000 listings regenerate and redraw in ${ms} ms`);
  await page.waitForTimeout(2000);
  const b = await page.locator("[class*=banner]").textContent();
  check(/1000 items across campus/.test(b), `heat banner counts all 1000: "${b.trim()}"`);
  await shot(page, "12-stress-1000-heatmap");

  await zoomIn(page, 1); // 1:8000 → clustered
  await shot(page, "13-stress-1000-clusters");
  await zoomIn(page, 1); // 1:4000 → every seller
  await shot(page, "14-stress-1000-dots");

  await page.getByRole("button", { name: "clothing", exact: true }).click();
  await zoomIn(page, 1); // 1:2000 → photos
  await photoPins(page).first().waitFor({ timeout: 15_000 });
  const shown = await photoPins(page).count();
  check(shown > 0 && shown <= 40, `1000 listings, photo view: ${shown} frames shown after decluttering`);
  await shot(page, "15-stress-1000-photo-pins");

  await page.getByRole("button", { name: "Clear all filters" }).click();
  await zoomOut(page, 3);
  const ms50 = await setListings(page, 50);
  check(ms50 < 5000, `50 listings regenerate in ${ms50} ms`);
  await page.waitForTimeout(2000);
  const b50 = await page.locator("[class*=banner]").textContent();
  check(/50 items across campus/.test(b50), `heat banner counts 50: "${b50.trim()}"`);
  await shot(page, "16-stress-50-heatmap");
  await zoomIn(page, 2);
  await shot(page, "17-stress-50-dots");

  await page.close();
}

// ---------------- phone ----------------
{
  const page = await open({ width: 390, height: 844 });
  await shot(page, "08-mobile-heatmap");

  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.waitForTimeout(400);
  await shot(page, "09-mobile-filters-drawer");
  await page.getByRole("button", { name: "clothing", exact: true }).click();
  await page.getByRole("button", { name: "Close filters" }).click();
  await page.getByRole("button", { name: "Hide panel" }).click();

  const pins = photoPins(page);
  for (let i = 0; i < 5 && !(await pins.count()); i++) await zoomIn(page, 1);
  check((await pins.count()) > 0, `mobile: photo pins (${await pins.count()})`);
  await shot(page, "10-mobile-photo-pins");

  if (await pins.count()) {
    await press(pins.first());
    const g = page.getByRole("dialog");
    await g.waitFor();
    const gb = await g.boundingBox();
    check(gb.x >= 0 && gb.x + gb.width <= 390 && gb.y + gb.height >= 844 - 20, "mobile: gallery is a bottom sheet");
    await page.waitForTimeout(400);
    await shot(page, "11-mobile-gallery-sheet");
  }
  await page.close();
}

await browser.close();

const real = errors.filter((e) => !/favicon/.test(e));
check(real.length === 0, `no page or console errors${real.length ? ":\n    " + real.join("\n    ") : ""}`);
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
