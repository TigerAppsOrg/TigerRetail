import type { Dept } from "../types";
import { DEPTS } from "./catalog";

/* Each department owns a direction on every dot (degrees clockwise from 12
   o'clock), so a colour is always found in the same place:
     women's ↗   men's ↘   misc ←
   Gray (misc) is the anchor: whenever it's in a dot it sits centred on the
   left, and the clothing colours share the right. */
export const DEPT_HOME: Record<Dept, number> = { "women's": 30, "men's": 150, misc: 270 };
const ANCHOR: Dept = "misc";

export interface Slice {
  dept: Dept;
  start: number; // degrees clockwise from 12 o'clock, [0, 360)
  end: number; // (0, 360]; may be less than start when the slice crosses 12 o'clock
}

const circDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

const cache = new Map<string, Slice[]>();

/* Equal slices (halves or thirds) for the departments a seller has, in
   clockwise home order. If gray is there, the pie is turned so gray is centred
   on 9 o'clock; otherwise it's turned so each slice sits as close to its home
   as it can (least squares over whole degrees). */
export function pieSlices(depts: Dept[]): Slice[] {
  const present = DEPTS.filter((d) => depts.includes(d));
  const key = present.join("|");
  const hit = cache.get(key);
  if (hit) return hit;
  if (present.length === 0) throw new Error("pieSlices: a seller pin needs at least one department");
  if (present.length === 1) {
    const whole = [{ dept: present[0], start: 0, end: 360 }];
    cache.set(key, whole);
    return whole;
  }

  const w = 360 / present.length;
  const anchor = present.indexOf(ANCHOR);
  let best = 0;
  let bestCost = Infinity;
  if (anchor >= 0) best = (((DEPT_HOME[ANCHOR] - w * anchor - w / 2) % 360) + 360) % 360;
  else
    for (let start = 0; start < 360; start++) {
      const cost = present.reduce((sum, d, i) => sum + circDiff(start + w * i + w / 2, DEPT_HOME[d]) ** 2, 0);
      if (cost < bestCost - 1e-9) {
        bestCost = cost;
        best = start;
      }
    }
  const slices = present.map((dept, i) => {
    const start = (best + w * i) % 360;
    const end = start + w > 360 ? start + w - 360 : start + w;
    return { dept, start, end };
  });
  cache.set(key, slices);
  return slices;
}

/* Drawing data for a pie, in a box centred on 0,0. Shared by the map symbol
   (as an SVG string) and the React swatches, so they always match. */
export function pieShapes(depts: Dept[], r: number): { dept: Dept; d: string | null }[] {
  const pt = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(r * Math.sin(a)).toFixed(3)} ${(-r * Math.cos(a)).toFixed(3)}`;
  };
  return pieSlices(depts).map(({ dept, start, end }) => {
    const span = (end - start + 360) % 360 || 360;
    if (span >= 360) return { dept, d: null }; // a whole circle
    return { dept, d: `M0 0L${pt(start)}A${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${pt(end)}Z` };
  });
}
