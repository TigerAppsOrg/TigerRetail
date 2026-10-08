import type { Building, Dept, Filters, Listing, Seller, SellerPin } from "../types";
import { DEPTS } from "./catalog";
import { matchesListing, matchesLocation } from "./filters";
import { haversineMeters, offsetMeters } from "./geo";

/* Sellers sharing a building are laid out on a sunflower (Vogel) spiral
   around it: r = c·√i, θ = i·137.5°. Every point gets the same area, so
   neighbours stay ~1.8c apart however many sellers a building has. */
const SPIRAL_C = 8; // metres
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const deptsOf = (listings: Listing[]): Dept[] => DEPTS.filter((d) => listings.some((l) => l.dept === d));

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
      const r = SPIRAL_C * Math.sqrt(i + 0.5);
      const at = group.length === 1 ? building : offsetMeters(building, r * Math.cos(i * GOLDEN_ANGLE), r * Math.sin(i * GOLDEN_ANGLE));
      pins.push({ seller, building, lon: at.lon, lat: at.lat, listings, depts: deptsOf(listings) });
    });
  }
  return { pins, unresolved };
}

export function sortByDistance(pins: SellerPin[], from: { lon: number; lat: number }) {
  return pins
    .map((pin) => ({ pin, meters: haversineMeters(from, pin) }))
    .sort((a, b) => a.meters - b.meters);
}
