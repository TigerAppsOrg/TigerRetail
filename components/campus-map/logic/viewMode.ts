import type { ViewMode } from "../types";

/* Map scale is "1 : scale", so a bigger number is further out.
   Zoomed out to the whole campus: heat only. Closer in: one dot per seller.
   Closest, and only while filtering by item: photo pins on the dots. */
export const HEAT_ABOVE_SCALE = 9_000;
export const PHOTOS_BELOW_SCALE = 3_500;

export function viewMode(scale: number, itemFilter: boolean): ViewMode {
  if (scale > HEAT_ABOVE_SCALE) return "heat";
  if (itemFilter && scale <= PHOTOS_BELOW_SCALE) return "photos";
  return "dots";
}
