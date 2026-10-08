"use client";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type MapView from "@arcgis/core/views/MapView";
import Point from "@arcgis/core/geometry/Point";
import type { Listing, Seller, SellerPin } from "./types";
import { DEPT_COLOR, tidyCollege } from "./logic/catalog";
import { placePopover } from "./logic/popover";
import s from "./campus-map.module.css";

interface Props {
  view: MapView;
  frame: number;
  pin: SellerPin;
  totalListings: number;
  filtered: boolean;
  directionsUnlocked: boolean;
  /* px on the right taken by another card; the gallery won't open under it */
  reserveRight: number;
  onClose: () => void;
  onWalk: () => void;
  onOpenListing: (l: Listing) => void;
  onOpenSeller: (s: Seller) => void;
}

const W = 320;

/* The pop-out gallery. It hangs beside its pin and follows it as the map
   moves, but never moves the map itself. */
export function SellerGallery(p: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(360);
  useLayoutEffect(() => {
    if (ref.current) setH(ref.current.offsetHeight);
  }, [p.pin]);

  const point = useMemo(() => new Point({ longitude: p.pin.lon, latitude: p.pin.lat }), [p.pin]);
  void p.frame;
  const anchor = p.view.toScreen(point) ?? { x: -9999, y: -9999 };
  // the side panel only sits on the right on wide screens (see .panel media query)
  const reserve = typeof window !== "undefined" && window.innerWidth > 820 ? p.reserveRight : 0;
  const place = placePopover(anchor, { w: W, h }, { w: p.view.width - reserve, h: p.view.height });

  const { seller, building, listings } = p.pin;
  const style = place.side === "sheet" ? undefined : { left: place.left, top: place.top };

  return (
    <div
      ref={ref}
      className={`${s.gallery} ${s[place.side]}`}
      style={style}
      role="dialog"
      aria-label={`${seller.name}'s items`}
      onKeyDown={(e) => e.key === "Escape" && p.onClose()}
    >
      {place.side !== "sheet" && <span className={s.arrow} style={{ top: place.arrow }} />}
      <div className={s.ghead}>
        <i className={s.swatch} style={{ background: DEPT_COLOR[p.pin.dept], marginTop: 5 }} />
        <div>
          <h3>
            {seller.name} <span className={s.gmeta}>· {seller.id}</span>
          </h3>
          <div className={s.gmeta}>
            {building.name} · {tidyCollege(building.college)}
          </div>
        </div>
        <button className={s.x} onClick={p.onClose} aria-label="Close" autoFocus>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className={s.gbody}>
        <div className={s.gmeta}>
          {p.filtered ? `${listings.length} of ${p.totalListings} items match your filters` : `${listings.length} items for sale`}
        </div>
        <div className={s.ggrid}>
          {listings.map((l) => (
            <button key={l.id} className={s.gitem} onClick={() => p.onOpenListing(l)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- seller uploads */}
              <img src={l.imageUrl} alt="" />
              <b>{l.title}</b>
              <span>${l.price}</span>
            </button>
          ))}
        </div>
        {p.directionsUnlocked ? (
          <div className={`${s.lock} ${s.open}`}>
            <span aria-hidden>📍</span>
            <span>
              <b>Room directions:</b> {seller.roomDirections}
            </span>
          </div>
        ) : (
          <div className={s.lock}>
            <span aria-hidden>🔒</span>
            <span>Room directions are shared once {seller.name} accepts your offer.</span>
          </div>
        )}
      </div>

      <div className={s.gfoot}>
        <button className={s.outline} onClick={p.onWalk}>
          Walk here
        </button>
        <button className={s.primary} onClick={() => p.onOpenSeller(seller)}>
          {p.totalListings > listings.length ? `See all ${p.totalListings} →` : "Seller page →"}
        </button>
      </div>
    </div>
  );
}
