import type { Building, Dept, Filters, Listing, Seller, SellerPin } from "../types";
import { DEPTS } from "./catalog";
import { matchesListing, matchesLocation } from "./filters";
import { haversineMeters, offsetMeters } from "./geo";

/* Sellers sharing a building sit on a small ring around it, so their dots
   don't land exactly on top of each other. */
const RING_METERS = 9;

function dominantDept(listings: Listing[]): Dept {
  const n = new Map<Dept, number>();
  for (const l of listings) n.set(l.dept, (n.get(l.dept) ?? 0) + 1);
  // ties break in DEPTS order so colours are stable
  return DEPTS.reduce((best, d) => ((n.get(d) ?? 0) > (n.get(best) ?? 0) ? d : best), DEPTS[0]);
}

export function buildSellerPins(
  sellers: Seller[],
  listings: Listing[],
  buildings: Map<string, Building>,
  f: Filters,
  now: Date,
): { pins: SellerPin[]; unresolved: Seller[] } {
  const bySeller = new Map<string, Listing[]>();
  for (const l of listings) {
    if (!matchesListing(l, f, now)) continue;
    const arr = bySeller.get(l.sellerId);
    if (arr) arr.push(l);
    else bySeller.set(l.sellerId, [l]);
  }

  const unresolved: Seller[] = [];
  const byBuilding = new Map<string, { seller: Seller; listings: Listing[] }[]>();
  for (const seller of sellers) {
    const b = buildings.get(seller.building);
    if (!b) {
      unresolved.push(seller);
      continue;
    }
    const mine = bySeller.get(seller.id);
    if (!mine?.length || !matchesLocation(b, f)) continue;
    const arr = byBuilding.get(b.name) ?? [];
    arr.push({ seller, listings: mine });
    byBuilding.set(b.name, arr);
  }

  const pins: SellerPin[] = [];
  for (const [name, group] of byBuilding) {
    const building = buildings.get(name)!;
    group.sort((a, b) => a.seller.id.localeCompare(b.seller.id));
    group.forEach(({ seller, listings }, i) => {
      const at =
        group.length === 1
          ? building
          : offsetMeters(
              building,
              RING_METERS * Math.cos((2 * Math.PI * i) / group.length),
              RING_METERS * Math.sin((2 * Math.PI * i) / group.length),
            );
      pins.push({ seller, building, lon: at.lon, lat: at.lat, listings, dept: dominantDept(listings) });
    });
  }
  return { pins, unresolved };
}

export function sortByDistance(pins: SellerPin[], from: { lon: number; lat: number }) {
  return pins
    .map((pin) => ({ pin, meters: haversineMeters(from, pin) }))
    .sort((a, b) => a.meters - b.meters);
}
