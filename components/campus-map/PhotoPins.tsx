"use client";
import { useEffect, useMemo, useState } from "react";
import type MapView from "@arcgis/core/views/MapView";
import Point from "@arcgis/core/geometry/Point";
import type { SellerPin } from "./types";
import { declutter } from "./logic/declutter";
import s from "./campus-map.module.css";

const BOX = { w: 66, h: 74 }; // frame + tail, with a little air
const ROTATE_MS = 2400;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Photo frames standing on top of each seller's dot. White frame = one item,
   orange frame = several, cycling. Overlapping frames are thinned out
   (biggest seller wins); their dots are still on the map underneath. */
export function PhotoPins({ view, pins, frame, onSelect }: { view: MapView; pins: SellerPin[]; frame: number; onSelect: (id: string) => void }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reducedMotion()) return;
    const t = setInterval(() => setTick((n) => n + 1), ROTATE_MS);
    return () => clearInterval(t);
  }, []);

  const points = useMemo(() => new Map(pins.map((p) => [p.seller.id, new Point({ longitude: p.lon, latitude: p.lat })])), [pins]);

  const placed = useMemo(() => {
    void frame; // recompute on every view move
    const vp = { w: view.width, h: view.height };
    const screen = pins.flatMap((p) => {
      const sp = view.toScreen(points.get(p.seller.id)!);
      return sp ? [{ pin: p, x: sp.x, y: sp.y }] : [];
    });
    // box is centred above the dot, so declutter on the frame's centre
    const keep = declutter(
      screen.map(({ pin, x, y }) => ({ id: pin.seller.id, x, y: y - BOX.h / 2, priority: pin.listings.length })),
      BOX,
      vp,
    );
    return screen.filter((p) => keep.has(p.pin.seller.id));
  }, [pins, points, view, frame]);

  return (
    <>
      {placed.map(({ pin, x, y }) => {
        const n = pin.listings.length;
        const shown = n > 1 ? tick % n : 0;
        return (
          <button
            key={pin.seller.id}
            className={`${s.pin} ${n > 1 ? s.multi : ""}`}
            style={{ transform: `translate(${x}px, ${y - 6}px) translate(-50%, -100%)` }}
            onClick={() => onSelect(pin.seller.id)}
            aria-label={`${pin.seller.name}: ${n} matching item${n === 1 ? "" : "s"}`}
          >
            {n > 1 && <span className={s.pinbadge}>{n}</span>}
            <span className={s.pinframe}>
              {pin.listings.slice(0, 5).map((l, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- data URIs and seller uploads, not optimisable statics
                <img key={l.id} src={l.imageUrl} alt="" style={{ opacity: i === shown % Math.min(n, 5) ? 1 : 0 }} />
              ))}
              {n > 1 && (
                <span className={s.pindots}>
                  {pin.listings.slice(0, 5).map((l, i) => (
                    <i key={l.id} className={i === shown % Math.min(n, 5) ? s.on : ""} />
                  ))}
                </span>
              )}
            </span>
            <span className={s.pintail} />
          </button>
        );
      })}
    </>
  );
}
