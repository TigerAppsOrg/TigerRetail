/* Demo data for the map prototype. NOT part of the component: when this merges
   into TigerRetail, the page passes real sellers and listings instead.

   Sellers live in real buildings from Princeton's Buildings layer (names must
   match exactly). Everything else is generated from a fixed seed so the
   prototype looks the same on every load. */
import type { Dept, Listing, Section, Seller } from "@/components/campus-map/types";
import { APPAREL, SECTIONS } from "@/components/campus-map/logic/catalog";
import { itemPhoto } from "./itemPhoto";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rnd = mulberry32(20261007);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];

/* [building, how many sellers]. Underclass colleges are busier, the way
   move-in and move-out actually go. */
const HOMES: [string, number][] = [
  ["1976 Hall", 3], ["Bloomberg Hall", 2], ["Wilf Hall", 2], ["Yoseloff Hall", 1], ["Bogle Hall", 1],
  ["Forbes College Main", 3], ["Forbes Courtyard Annex", 2],
  ["Lauritzen Hall", 2], ["Class of 1981 Hall", 2], ["Fisher Hall Dorm", 1], ["Hargadon Hall", 1], ["Murley-Pivirotto Family Tower", 1],
  ["Holder Hall", 2], ["Witherspoon Hall", 1], ["Buyers Hall", 1], ["Campbell Hall", 1],
  ["Blair Hall", 2], ["Joline Hall", 1], ["Little Hall", 1], ["Edwards Hall", 1],
  ["Kanji Hall", 1], ["Addy Hall", 1], ["Kwanza Jones Hall", 1],
  ["Hariri Hall", 1], ["Fu Hall", 1],
  ["Walker Hall", 1],
  ["Spelman Halls", 2], ["Scully Hall", 1], ["Class of 1903 Hall", 1], ["Pyne Hall", 1], ["Lockhart Hall", 1],
  ["Graduate College, New", 1],
];

const FIRST = ["ava", "ben", "chloe", "dev", "ella", "farah", "gabe", "hana", "isaac", "jiya", "kai", "lena", "milo",
  "nora", "omar", "priya", "quinn", "rosa", "sam", "tara", "uma", "vik", "wren", "xavi", "yara", "zane", "amel",
  "bo", "cleo", "dani", "eli", "fern", "gus", "ines", "jo", "kofi", "lu", "max", "nia", "oli", "pia", "ray", "sol"];

const DIRECTIONS = ["2nd floor, two lefts out of the stairwell", "ground floor, end of the hall by the laundry",
  "3rd floor, first door past the kitchen", "basement entry, room faces the courtyard", "4th floor, take the elevator then right",
  "1st floor entryway B, door on the left"];

const TITLES: Record<string, string[]> = {
  tops: ["vintage crewneck", "going out top", "knit cardigan", "princeton tiger tee", "linen button-up"],
  bottoms: ["levi's 501 jeans", "wide-leg trousers", "denim maxi skirt", "corduroy cargos"],
  "dresses/rompers": ["sundress", "black mini dress", "floral romper"],
  outerwear: ["puffer jacket", "reunions blazer", "wool peacoat", "rain shell"],
  shoes: ["white sneakers", "running shoes", "formal heels", "chelsea boots", "loafers"],
  bags: ["tote bag", "leather backpack", "crossbody bag"],
  jewelry: ["gold hoops", "pearl necklace", "silver rings set"],
  hats: ["tiger beanie", "baseball cap"],
  "belts & scarves": ["orange scarf", "leather belt"],
  sunglasses: ["ray-ban wayfarers", "cat-eye sunglasses"],
  lawnparties: ["lawnparties sundress", "pastel button-down"],
  formals: ["black formal dress", "navy suit", "satin slip dress"],
  "going out": ["sparkly top", "leather skirt"],
  grad: ["grad photoshoot dress", "grad stole"],
  furniture: ["mini fridge", "desk chair", "rolling cart", "floor mirror", "bean bag"],
  decoration: ["string lights", "corkboard + pins", "tapestry", "plant + pot"],
  essentials: ["twin xl bedding", "desk lamp", "shower caddy", "storage bins (3)", "fan"],
  textbooks: ["cos 226 textbook", "orgo model kit", "econ 100 reader"],
  stationery: ["textbook stand", "planner + pens"],
  electronics: ["ti-84 calculator", "monitor", "bluetooth speaker"],
  "lab gear": ["lab goggles", "lab coat (m)"],
  "everything else": ["film camera", "yoga mat", "bike lock", "board games"],
};

const SECTION_WEIGHT: [Section, number][] = [
  ["clothing", 5], ["accessories", 2], ["special occasions", 2], ["dorm", 4], ["school supplies", 2], ["everything else", 1],
];
const weightedSection = () => {
  let r = rnd() * SECTION_WEIGHT.reduce((a, [, w]) => a + w, 0);
  for (const [s, w] of SECTION_WEIGHT) if ((r -= w) < 0) return s;
  return SECTION_WEIGHT[0][0];
};
const subsOf = new Map(SECTIONS);

/* Each seller leans one way, so dot colours mean something. */
const LEAN: Dept[] = ["women's", "women's", "men's", "men's", "unisex", "misc"];

/* Buildings drawn in proportion to their HOMES weight. */
const HOME_POOL = HOMES.flatMap(([b, w]) => Array<string>(w).fill(b));

export const DEFAULT_LISTINGS = 200;

/* Exactly `listingCount` listings; the number of sellers grows with it
   (~4.5 items each), spread over the same dorms, so 1000 listings is a
   genuinely crowded campus rather than the same sellers with more stuff. */
export function demoMarketplace(
  now = new Date(),
  listingCount = DEFAULT_LISTINGS,
): { sellers: Seller[]; listings: Listing[] } {
  rnd = mulberry32(20261007); // same data on every call, StrictMode double-renders included
  const sellers: Seller[] = [];
  const listings: Listing[] = [];
  for (let n = 0; listings.length < listingCount; n++) {
    // first pass covers every home once, so even small counts spread across campus
    const building = n < HOMES.length ? HOMES[n][0] : pick(HOME_POOL);
    const first = FIRST[n % FIRST.length];
    // 37 is coprime with 9000, so ids stay unique for the first 9000 sellers
    const id = `${first.slice(0, 2)}${1000 + ((n * 37) % 9000)}`;
    sellers.push({ id, name: first[0].toUpperCase() + first.slice(1), building, roomDirections: pick(DIRECTIONS) });
    const lean = pick(LEAN);
    // a few seniors clearing out a whole room, most selling a handful
    const wanted = rnd() < 0.15 ? 8 + Math.floor(rnd() * 7) : 1 + Math.floor(rnd() * 5);
    const items = Math.min(wanted, listingCount - listings.length);
    for (let k = 0; k < items; k++) {
      const section = lean === "misc" && rnd() < 0.7 ? pick(["dorm", "school supplies", "everything else"] as Section[]) : weightedSection();
      const sub = pick(subsOf.get(section)!);
      const dept: Dept = !APPAREL.has(section) ? "misc" : rnd() < 0.75 && lean !== "misc" ? lean : pick(["women's", "men's", "unisex"] as Dept[]);
      const title = pick(TITLES[sub]);
      const ageDays = rnd() < 0.5 ? rnd() * 7 : rnd() * 40;
      listings.push({
        id: `${id}-${k}`,
        sellerId: id,
        title,
        price: 5 + Math.round(rnd() * 11) * 5,
        section,
        sub,
        dept,
        imageUrl: itemPhoto(title, section, n * 31 + k),
        postedAt: new Date(now.getTime() - ageDays * 86_400_000).toISOString(),
      });
    }
  }
  return { sellers, listings };
}
