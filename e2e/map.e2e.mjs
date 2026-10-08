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
  await page.getByRole("status").filter({ hasText: "across campus" }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500); // let tiles finish drawing
  return page;
}

/* zoom one level in, centred on the map stage (the map opens on the dorms) */
async function zoomIn(page, times = 1) {
  const box = await page.locator("[class*=stage]").first().boundingBox();
  for (let i = 0; i < times; i++) {
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(1500);
}

// ---------------- desktop ----------------
{
  const page = await open({ width: 1440, height: 900 });

  const banner = await page.getByRole("status").first().textContent();
  check(/\d+ items across campus/.test(banner), `heat view banner: "${banner.trim()}"`);
  check((await page.locator("[class*=pinframe]").count()) === 0, "no photo pins at campus scale");
  await shot(page, "01-heatmap-campus");

  await zoomIn(page, 2);
  const banner2 = await page.getByRole("status").first().textContent();
  check(/Filter by what you want/.test(banner2), `dots view banner: "${banner2.trim()}"`);
  check((await page.locator("[class*=pinframe]").count()) === 0, "still no photo pins without an item filter");
  await shot(page, "02-seller-dots");

  await page.getByRole("button", { name: "clothing", exact: true }).click();
  await page.waitForTimeout(800);
  await shot(page, "03-filter-clothing-dots");

  await zoomIn(page, 1);
  const pins = page.locator("button[aria-label*='matching item']");
  const nPins = await pins.count();
  check(nPins > 0, `photo pins appear when zoomed in with a filter (${nPins})`);
  const multi = page.locator("button[aria-label*='matching items']");
  check((await multi.count()) > 0, "at least one multi-item (carousel) pin");
  await shot(page, "04-photo-pins");

  // the pop-out gallery
  await multi.first().click();
  const gallery = page.getByRole("dialog");
  await gallery.waitFor();
  check((await page.locator("[class*=pinframe]").count()) === 0, "other photo pins hide while a gallery is open");
  const gtext = await gallery.textContent();
  check(/match your filters|items for sale/.test(gtext), "gallery shows matching-item count");
  check(/Room directions are shared once|Room directions:/.test(gtext), "gallery shows room-directions privacy state");
  const thumbs = await gallery.locator("img").count();
  check(thumbs > 1, `gallery shows the seller's items (${thumbs})`);
  await shot(page, "05-gallery-popout");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  check((await page.getByRole("dialog").count()) === 0, "Escape closes the gallery");
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

  const pins = page.locator("button[aria-label*='matching item']");
  // double-clicks can be swallowed mid-animation on a small screen: zoom until photo scale
  for (let i = 0; i < 5 && !(await pins.count()); i++) await zoomIn(page, 1);
  check((await pins.count()) > 0, `mobile: photo pins (${await pins.count()})`);
  await shot(page, "10-mobile-photo-pins");

  if (await pins.count()) {
    await pins.first().click();
    const g = page.getByRole("dialog");
    await g.waitFor();
    const gb = await g.boundingBox();
    check(gb.x >= 0 && gb.x + gb.width <= 390, "mobile: gallery fits the screen (bottom sheet)");
    await shot(page, "11-mobile-gallery-sheet");
  }
  await page.close();
}

await browser.close();

const real = errors.filter((e) => !/favicon/.test(e));
check(real.length === 0, `no page or console errors${real.length ? ":\n    " + real.join("\n    ") : ""}`);
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
