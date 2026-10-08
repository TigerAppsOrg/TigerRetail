export interface ScreenPin {
  id: string;
  x: number;
  y: number;
  priority: number;
}

/* Greedy label placement: highest priority first, keep a pin only if its box
   doesn't overlap one already kept. The dropped ones still show as dots
   underneath, so nothing disappears from the map, only the photo frame. */
export function declutter(
  pins: ScreenPin[],
  box: { w: number; h: number },
  viewport: { w: number; h: number },
): Set<string> {
  const order = [...pins].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const kept: ScreenPin[] = [];
  for (const p of order) {
    if (p.x < -box.w / 2 || p.y < -box.h || p.x > viewport.w + box.w / 2 || p.y > viewport.h + box.h) continue;
    if (kept.some((k) => Math.abs(k.x - p.x) < box.w && Math.abs(k.y - p.y) < box.h)) continue;
    kept.push(p);
  }
  return new Set(kept.map((k) => k.id));
}
