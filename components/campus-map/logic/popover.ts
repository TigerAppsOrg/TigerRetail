export interface Placement {
  left: number;
  top: number;
  side: "right" | "left" | "sheet";
  arrow: number; // arrow's y offset from the popover's top edge
}

const GAP = 18; // space between pin and popover
const MARGIN = 12; // keep this far from the viewport edge
const SHEET_BELOW = 560; // narrower than this, it's a phone: always a bottom sheet

/* The gallery floats beside its pin, the way Google's reCAPTCHA image picker
   floats beside its checkbox: the map never pans, and closing it puts you
   back exactly where you were. On a phone there's no room beside the pin, so
   it becomes a bottom sheet. */
export function placePopover(
  anchor: { x: number; y: number },
  size: { w: number; h: number },
  viewport: { w: number; h: number },
): Placement {
  if (viewport.w < SHEET_BELOW) return { left: 0, top: 0, side: "sheet", arrow: 0 };
  const top = Math.min(Math.max(anchor.y - size.h / 2, MARGIN), Math.max(MARGIN, viewport.h - size.h - MARGIN));
  const arrow = Math.min(Math.max(anchor.y - top, 16), size.h - 16);

  if (anchor.x + GAP + size.w + MARGIN <= viewport.w) {
    return { left: anchor.x + GAP, top, side: "right", arrow };
  }
  if (anchor.x - GAP - size.w >= MARGIN) {
    return { left: anchor.x - GAP - size.w, top, side: "left", arrow };
  }
  return { left: 0, top: 0, side: "sheet", arrow: 0 };
}
