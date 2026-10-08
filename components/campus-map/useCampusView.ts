"use client";
/* Owns the ArcGIS side: Princeton's web map, the sellers layer, the route
   layer, and the view-change signal the React overlays redraw on. */
import { useEffect, useEffectEvent, useRef, useState } from "react";
import WebMap from "@arcgis/core/WebMap";
import MapView from "@arcgis/core/views/MapView";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import MapImageLayer from "@arcgis/core/layers/MapImageLayer";
import Graphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import type { SellerPin, ViewMode } from "./types";
import { viewMode } from "./logic/viewMode";
import { CAMPUS_WEBMAP_ID, CLEAN_RENDER_SCALES, NEIGHBOURHOOD_LABELS, TIGERMAP_URL } from "./princeton";
import { CLUSTER_MAX_SCALE, dotsRenderer, heatRenderer, sellerClusters } from "./renderers";
import type { WalkingRoute } from "./princeton";

/* Of everything in Princeton's web map, keep the building outlines. Bus
   positions, restrooms, construction impacts etc. are noise for shopping. */
const KEEP_LAYERS = new Set(["Buildings"]);

/* Opens on the residential part of campus, zoomed out far enough for heat. */
const CAMPUS_CENTER: [number, number] = [-74.6565, 40.3448];
const START_SCALE = 16_000;

/* goTo() rejects when the user grabs the map mid-animation. That's expected;
   anything else is a real failure and gets reported. */
export function ignoreInterrupt(e: unknown) {
  if (e instanceof Error && e.name === "AbortError") return;
  console.error("[campus-map] goTo failed", e);
}

export type MapHit =
  | { kind: "seller"; sellerId: string }
  | { kind: "zoom"; point: Point; scale: number } // heat spot or cluster: go closer
  | { kind: "empty" };

export interface CampusView {
  view: MapView | null;
  mode: ViewMode;
  ready: boolean;
  error: string | null;
  scale: number;
  frame: number; // bumps whenever the visible extent moves
}

export function useCampusView(
  container: React.RefObject<HTMLDivElement | null>,
  pins: SellerPin[],
  itemFilter: boolean,
  selected: SellerPin | null,
  walkingRoute: WalkingRoute | null,
  onMapClick: (view: MapView, hit: MapHit) => void,
): CampusView {
  const [state, setState] = useState<Omit<CampusView, "mode">>({ view: null, ready: false, error: null, scale: 0, frame: 0 });
  const mode = viewMode(state.ready ? state.scale : Infinity, itemFilter);
  const layers = useRef<{ sellers: FeatureLayer; overlay: GraphicsLayer; route: GraphicsLayer } | null>(null);
  const edits = useRef<Promise<unknown>>(Promise.resolve());
  // In heat mode a click zooms in; a cluster zooms in until it splits;
  // otherwise it picks the seller under the cursor.
  const handleClick = useEffectEvent(async (view: MapView, sellers: FeatureLayer, e: { mapPoint: Point } & Parameters<MapView["hitTest"]>[0]) => {
    if (mode === "heat") return onMapClick(view, { kind: "zoom", point: e.mapPoint, scale: 8_000 });
    const hit = await view.hitTest(e, { include: [sellers] });
    const r = hit.results.find((x) => x.type === "graphic");
    const g = r && "graphic" in r ? r.graphic : null;
    if (!g) return onMapClick(view, { kind: "empty" });
    if (g.isAggregate) return onMapClick(view, { kind: "zoom", point: g.geometry as Point, scale: 4_000 });
    onMapClick(view, { kind: "seller", sellerId: g.attributes.sellerId as string });
  });

  // ---- create the view once ----
  useEffect(() => {
    if (!container.current) return;
    const el = container.current;
    let teardown = () => {};
    // Start on the next tick: React's StrictMode mount/unmount/mount then never
    // builds (and aborts) a throwaway view.
    const start = setTimeout(() => {
      const map = new WebMap({ portalItem: { id: CAMPUS_WEBMAP_ID } });
      const sellers = new FeatureLayer({
        title: "TigerRetail sellers",
        source: [],
        objectIdField: "ObjectID",
        geometryType: "point",
        spatialReference: { wkid: 4326 },
        fields: [
          { name: "ObjectID", type: "oid" },
          { name: "sellerId", type: "string" },
          { name: "count", type: "integer" },
          { name: "dept", type: "string" },
        ],
        outFields: ["*"],
        renderer: heatRenderer(0),
        popupEnabled: false,
      });
      const route = new GraphicsLayer({ title: "route" });
      const overlay = new GraphicsLayer({ title: "selection" });
      const view = new MapView({
        container: el,
        map,
        center: CAMPUS_CENTER,
        scale: START_SCALE,
        popupEnabled: false,
        constraints: { rotationEnabled: false },
      });
      view.ui.move("zoom", "bottom-right");
      layers.current = { sellers, overlay, route };

      let raf = 0;
      const bump = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => setState((s) => ({ ...s, frame: s.frame + 1, scale: view.scale })));
      };

      const handles: { remove(): void }[] = [];
      // React may unmount before loading finishes (StrictMode does it on purpose);
      // a destroyed view's pending promises reject, and that's not a load failure.
      let disposed = false;
      map
        .loadAll()
        .then(() => {
          if (disposed) return;
          map.layers.forEach((l) => {
            l.visible = KEEP_LAYERS.has(l.title ?? "");
            if ("popupEnabled" in l) (l as FeatureLayer).popupEnabled = false;
          });
          map.addMany([route, sellers, overlay]);
          // Same Princeton basemap, rendered on request without the faded
          // neighbourhood watermarks, drawn over the cached tiles only at the
          // zoom levels that have them. It's a nicety: if it fails the map
          // still works, but the failure is reported, not hidden.
          const clean = new MapImageLayer({ url: TIGERMAP_URL, title: "basemap without faded labels", ...CLEAN_RENDER_SCALES });
          clean
            .load()
            .then(() => {
              for (const id of [NEIGHBOURHOOD_LABELS.fadedGroup, NEIGHBOURHOOD_LABELS.fadedClose]) {
                const sub = clean.findSublayerById(id);
                if (!sub) throw new Error(`Princeton's basemap no longer has label sublayer ${id}`);
                sub.visible = false;
              }
              if (!disposed) map.add(clean, 0); // above the basemap, below buildings and sellers
            })
            .catch((e: unknown) => {
              if (disposed) return;
              setState((s) => ({ ...s, error: `Couldn't hide the faded neighbourhood labels: ${e instanceof Error ? e.message : String(e)}` }));
            });
          return view.when();
        })
        .then(() => {
          if (disposed) return;
          setState((s) => ({ ...s, view, ready: true, scale: view.scale }));
          handles.push(reactiveUtils.watch(() => [view.extent, view.size], bump));
          handles.push(view.on("click", (e) => void handleClick(view, sellers, e)));
        })
        .catch((e: unknown) => {
          if (disposed) return;
          setState((s) => ({ ...s, error: `Couldn't load Princeton's campus map: ${e instanceof Error ? e.message : String(e)}` }));
        });

      teardown = () => {
        disposed = true;
        cancelAnimationFrame(raf);
        handles.forEach((h) => h.remove());
        view.destroy();
        layers.current = null;
      };
    }, 0);
    return () => {
      clearTimeout(start);
      teardown();
    };
  }, [container]);

  // ---- push pins into the sellers layer ----
  useEffect(() => {
    const l = layers.current;
    if (!l || !state.ready) return;
    const adds = pins.map(
      (p) =>
        new Graphic({
          geometry: new Point({ longitude: p.lon, latitude: p.lat }),
          attributes: { sellerId: p.seller.id, count: p.listings.length, dept: p.dept },
        }),
    );
    // serialise edits so a fast run of filter clicks can't interleave
    edits.current = edits.current
      .then(() => l.sellers.queryObjectIds())
      .then((ids) =>
        l.sellers.applyEdits({
          deleteFeatures: ids.map((id) => ({ objectId: Number(id) })) /* client-side layer: oids are numbers */,
          addFeatures: adds,
        }),
      )
      .catch((e: unknown) => setState((s) => ({ ...s, error: `Couldn't draw sellers: ${e instanceof Error ? e.message : String(e)}` })));
  }, [pins, state.ready]);

  // ---- heat vs dots (clustered at neighbourhood zoom) ----
  // Clustering is switched on/off here by scale rather than with the cluster's
  // own maxScale: past maxScale, ArcGIS 5.1 left most individual dots undrawn.
  const itemsShown = pins.reduce((a, p) => a + p.listings.length, 0);
  const clustered = mode !== "heat" && state.scale > CLUSTER_MAX_SCALE;
  useEffect(() => {
    const l = layers.current;
    if (!l || !state.ready) return;
    if (mode === "heat") {
      l.sellers.featureReduction = null; // clustering and heatmaps don't mix
      l.sellers.renderer = heatRenderer(itemsShown);
    } else {
      l.sellers.renderer = dotsRenderer();
      l.sellers.featureReduction = clustered ? sellerClusters() : null;
    }
  }, [mode, clustered, itemsShown, state.ready]);

  // ---- ring around the selected seller ----
  useEffect(() => {
    const l = layers.current;
    if (!l || !state.ready) return;
    l.overlay.removeAll();
    if (selected && mode !== "heat") {
      l.overlay.add(
        new Graphic({
          geometry: new Point({ longitude: selected.lon, latitude: selected.lat }),
          symbol: { type: "simple-marker", style: "circle", size: 40, color: [0, 0, 0, 0], outline: { color: "#BB4C19", width: 3 } },
        }),
      );
    }
  }, [selected, mode, state.ready]);

  // ---- walking route ----
  useEffect(() => {
    const l = layers.current;
    if (!l || !state.ready) return;
    l.route.removeAll();
    if (!walkingRoute) return;
    l.route.addMany([
      new Graphic({ geometry: walkingRoute.path, symbol: { type: "simple-line", color: "white", width: 9, cap: "round", join: "round" } }),
      new Graphic({
        geometry: walkingRoute.path,
        symbol: { type: "simple-line", color: "#BB4C19", width: 5, cap: "round", join: "round" },
      }),
    ]);
  }, [walkingRoute, state.ready]);

  return { ...state, mode };
}
