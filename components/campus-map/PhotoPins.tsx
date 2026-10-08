"use client";
/* Photo pins, drawn by ArcGIS in a graphics layer right above the seller dots,
   so they pan and zoom in lockstep with them. Fixed screen size at any zoom.
   Overlapping frames are thinned out whenever the map comes to rest (biggest
   seller wins); their dots stay visible underneath. */
import { useEffect, useState } from "react";
import type MapView from "@arcgis/core/views/MapView";
import type GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Graphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import PictureMarkerSymbol from "@arcgis/core/symbols/PictureMarkerSymbol";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import type { SellerPin } from "./types";
import { declutter } from "./logic/declutter";
import { MARKER, photoMarker } from "./photoMarker";
import s from "./campus-map.module.css";

const ROTATE_MS = 2400;
const CAROUSEL_MAX = 5;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function usePhotoPins(
  view: MapView | null,
  layer: GraphicsLayer | null,
  pins: SellerPin[],
  active: boolean,
  onError: (msg: string) => void,
): SellerPin[] {
  const [shownPins, setShownPins] = useState<SellerPin[]>([]);

  useEffect(() => {
    if (!view || !layer) return;
    layer.removeAll();
    if (!active) return;

    let cancelled = false;
    const entries = pins.map((pin) => ({
      pin,
      shown: 0,
      ready: false,
      graphic: new Graphic({
        geometry: new Point({ longitude: pin.lon, latitude: pin.lat }),
        attributes: { sellerId: pin.seller.id },
        visible: false,
      }),
    }));
    layer.addMany(entries.map((e) => e.graphic));

    const fail = (e: unknown) => !cancelled && onError(e instanceof Error ? e.message : String(e));

    const setFrame = (e: (typeof entries)[number]) => {
      const n = e.pin.listings.length;
      const listing = e.pin.listings[e.shown % Math.min(n, CAROUSEL_MAX)];
      return photoMarker({ imageUrl: listing.imageUrl, count: n, shown: e.shown }).then((url) => {
        if (cancelled) return;
        e.graphic.symbol = new PictureMarkerSymbol({ url, width: `${MARKER.w}px`, height: `${MARKER.h}px`, yoffset: `${MARKER.yoffset}px` });
        e.ready = true;
      });
    };

    const relayout = () => {
      if (cancelled) return;
      const screen = entries.flatMap((e) => {
        const sp = view.toScreen(e.graphic.geometry as Point);
        return sp ? [{ id: e.pin.seller.id, x: sp.x, y: sp.y - MARKER.boxLift, priority: e.pin.listings.length }] : [];
      });
      const keep = declutter(screen, MARKER.box, { w: view.width, h: view.height });
      for (const e of entries) e.graphic.visible = e.ready && keep.has(e.pin.seller.id);
      setShownPins(entries.filter((e) => e.graphic.visible).map((e) => e.pin));
    };

    Promise.all(entries.map(setFrame)).then(relayout, fail);

    const handles = [
      reactiveUtils.when(() => view.stationary, relayout),
      reactiveUtils.watch(() => view.size, relayout),
    ];

    const timer = reducedMotion()
      ? undefined
      : setInterval(() => {
          for (const e of entries) {
            if (e.pin.listings.length < 2) continue;
            e.shown += 1;
            setFrame(e).catch(fail);
          }
        }, ROTATE_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      handles.forEach((h) => h.remove());
      layer.removeAll();
    };
  }, [view, layer, pins, active, onError]);

  return active ? shownPins : [];
}

/* Canvas markers can't take keyboard focus, so the visible pins are mirrored
   as a list of real buttons for keyboard and screen-reader users. */
export function PhotoPinList({ pins, onSelect }: { pins: SellerPin[]; onSelect: (id: string) => void }) {
  if (!pins.length) return null;
  return (
    <ul className={s.srOnly} aria-label="Sellers with matching items on the map">
      {pins.map((p) => (
        <li key={p.seller.id}>
          <button onClick={() => onSelect(p.seller.id)}>
            {p.seller.name}: {p.listings.length} matching item{p.listings.length === 1 ? "" : "s"}
          </button>
        </li>
      ))}
    </ul>
  );
}
