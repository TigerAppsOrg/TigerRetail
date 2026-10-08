export interface LonLat {
  lon: number;
  lat: number;
}

const R = 6_371_008.8; // mean Earth radius, metres
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineMeters(a: LonLat, b: LonLat): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* Move a point by dx metres east and dy metres north. Flat-earth is exact
   enough at the scale of a building. */
export function offsetMeters(p: LonLat, dx: number, dy: number): LonLat {
  return {
    lat: p.lat + (dy / R) * (180 / Math.PI),
    lon: p.lon + (dx / (R * Math.cos(rad(p.lat)))) * (180 / Math.PI),
  };
}

/* Area-weighted centroid of a closed ring (shoelace formula). A plain vertex
   average drifts toward whichever side of a building has the most vertices. */
export function polygonCentroid(ring: number[][]): [number, number] {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (a === 0) throw new Error("polygonCentroid: degenerate ring with zero area");
  return [cx / (3 * a), cy / (3 * a)];
}
