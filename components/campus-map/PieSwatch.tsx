import type { Dept } from "./types";
import { DEPT_COLOR } from "./logic/catalog";
import { pieShapes } from "./logic/pie";

/* The same pie as the seller's dot on the map, for lists and the gallery. */
export function PieSwatch({ depts, size = 12 }: { depts: Dept[]; size?: number }) {
  const r = size / 2 - 1;
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden style={{ flex: "none" }}>
      <circle r={size / 2} fill="white" />
      {pieShapes(depts, r).map(({ dept, d }) =>
        d ? <path key={dept} d={d} fill={DEPT_COLOR[dept]} /> : <circle key={dept} r={r} fill={DEPT_COLOR[dept]} />,
      )}
    </svg>
  );
}
