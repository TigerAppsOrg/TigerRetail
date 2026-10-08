"use client";
import { useLayoutEffect, useRef } from "react";
import type MapView from "@arcgis/core/views/MapView";
import Point from "@arcgis/core/geometry/Point";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import type { Listing, Seller, SellerPin } from "./types";
import { tidyCollege } from "./logic/catalog";
import { placePopover } from "./logic/popover";
import { PieSwatch } from "./PieSwatch";
import s from "./campus-map.module.css";

interface Props {
  view: MapView;
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
   moves, but never moves the map itself. Position is written straight to the
   DOM from a synchronous ArcGIS watch, so it moves in the same frame as the
   map instead of trailing a React render behind it. */
export function SellerGallery(p: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const { view, pin, reserveRight } = p;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const point = new Point({ longitude: pin.lon, latitude: pin.lat });
    const place = () => {
      const anchor = view.toScreen(point) ?? { x: -9999, y: -9999 };
      // the side panel only sits on the right on wide screens (see .panel media query)
      const reserve = window.innerWidth > 820 ? reserveRight : 0;
      const at = placePopover(anchor, { w: W, h: el.offsetHeight }, { w: view.width - reserve, h: view.height });
      el.dataset.side = at.side;
      el.style.left = at.side === "sheet" ? "" : `${at.left}px`;
      el.style.top = at.side === "sheet" ? "" : `${at.top}px`;
      if (arrowRef.current) arrowRef.current.style.top = `${at.arrow}px`;
    };
    place();
    const h = reactiveUtils.watch(() => [view.extent, view.size], place, { sync: true });
    return () => h.remove();
  }, [view, pin, reserveRight]);

  const { seller, building, listings } = pin;

  return (
    <div
      ref={ref}
      className={s.gallery}
      role="dialog"
      aria-label={`${seller.name}'s items`}
      onKeyDown={(e) => e.key === "Escape" && p.onClose()}
    >
      <span ref={arrowRef} className={s.arrow} />
      <div className={s.ghead}>
        <span style={{ marginTop: 4 }}>
          <PieSwatch depts={pin.depts} size={14} />
        </span>
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
