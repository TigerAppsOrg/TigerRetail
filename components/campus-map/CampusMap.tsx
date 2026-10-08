"use client";
/* TigerRetail campus map. Drop-in: pass sellers + listings, get the map.

   Zoomed out  → heat map of where things are being sold
   Zoomed in   → a dot per seller (colour = department, size = # items)
   Closest in, while filtering by item → photo frames on the dots
   Click a seller → their gallery pops out beside the pin; the map stays put. */
import "@arcgis/core/assets/esri/themes/light/main.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Point from "@arcgis/core/geometry/Point";
import type MapView from "@arcgis/core/views/MapView";
import type { Building, Filters, Listing, Seller } from "./types";
import { emptyFilters, hasItemFilter } from "./logic/filters";
import { buildSellerPins } from "./logic/pins";
import { HEAT_ABOVE_SCALE, PHOTOS_BELOW_SCALE } from "./logic/viewMode";
import { DEPTS, DEPT_COLOR, tidyCollege } from "./logic/catalog";
import { fetchResidentialBuildings, solveWalkingRoute } from "./princeton";
import { ignoreInterrupt, useCampusView } from "./useCampusView";
import { FilterPanel } from "./FilterPanel";
import { PhotoPins } from "./PhotoPins";
import { SellerGallery } from "./SellerGallery";
import { SidePanel, type RouteState } from "./SidePanel";
import s from "./campus-map.module.css";

export interface CampusMapProps {
  sellers: Seller[];
  listings: Listing[];
  /* Sellers who accepted one of the viewer's offers: their room directions show. */
  acceptedSellerIds?: string[];
  onOpenListing: (l: Listing) => void;
  onOpenSeller: (s: Seller) => void;
}

const ZOOM_IN_TO = (HEAT_ABOVE_SCALE + PHOTOS_BELOW_SCALE) / 2; // lands in dots mode

export default function CampusMap({ sellers, listings, acceptedSellerIds = [], onOpenListing, onOpenSeller }: CampusMapProps) {
  const mapEl = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [buildings, setBuildings] = useState<Building[] | null>(null);
  const [buildingsError, setBuildingsError] = useState<string | null>(null);
  const [buildingsTry, setBuildingsTry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [panel, setPanel] = useState<{ open: boolean; tab: "nearby" | "directions" }>({ open: true, tab: "nearby" });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [stepFree, setStepFree] = useState(false);
  const [route, setRoute] = useState<RouteState>({ status: "idle" });
  const [now] = useState(() => new Date());

  // ---- Princeton's residential buildings: where seller pins can live ----
  useEffect(() => {
    const ac = new AbortController();
    fetchResidentialBuildings(ac.signal)
      .then(setBuildings)
      .catch((e: unknown) => {
        if (!ac.signal.aborted) setBuildingsError(e instanceof Error ? e.message : String(e));
      });
    return () => ac.abort();
  }, [buildingsTry]);

  const byName = useMemo(() => new Map((buildings ?? []).map((b) => [b.name, b])), [buildings]);

  const { pins, unresolved } = useMemo(
    () => (buildings ? buildSellerPins(sellers, listings, byName, filters, now) : { pins: [], unresolved: [] }),
    [buildings, sellers, listings, byName, filters, now],
  );

  // facet counts for "where": sellers per college under the current what/when filters
  const sellersByCollege = useMemo(() => {
    const m = new Map<string, number>();
    if (!buildings) return m;
    for (const p of buildSellerPins(sellers, listings, byName, { ...filters, colleges: [], buildings: [] }, now).pins) {
      const c = tidyCollege(p.building.college);
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return m;
  }, [buildings, sellers, listings, byName, filters, now]);

  const totalBySeller = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of listings) m.set(l.sellerId, (m.get(l.sellerId) ?? 0) + 1);
    return m;
  }, [listings]);

  const selectedPin = pins.find((p) => p.seller.id === selectedId) ?? null;
  const itemFilter = hasItemFilter(filters);

  const onMapClick = useCallback((view: MapView, sellerId: string | null, mapPoint: Point | null) => {
    if (mapPoint) {
      // heat mode: clicking means "show me what's here"
      view.goTo({ target: mapPoint, scale: ZOOM_IN_TO }).catch(ignoreInterrupt);
      return;
    }
    setSelectedId(sellerId);
  }, []);

  const walking = route.status === "done" ? route.route : null;
  const cv = useCampusView(mapEl, pins, itemFilter, selectedPin, walking, onMapClick);
  const mode = cv.mode;
  // the gallery hides at campus scale: there are no dots there to anchor it to
  const selected = mode === "heat" ? null : selectedPin;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelectedId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const goRoute = useCallback(
    (fromName = from, toName = to) => {
      const a = byName.get(fromName);
      const b = byName.get(toName);
      if (!a || !b) return;
      setRoute({ status: "loading" });
      solveWalkingRoute(a, b, stepFree)
        .then((r) => {
          setRoute({ status: "done", route: r });
          cv.view?.goTo({ target: r.path.extent?.clone().expand(1.4) }).catch(ignoreInterrupt);
        })
        .catch((e: unknown) => setRoute({ status: "error", message: e instanceof Error ? e.message : String(e) }));
    },
    [byName, from, to, stepFree, cv.view],
  );

  const pickSeller = (id: string) => {
    const p = pins.find((x) => x.seller.id === id);
    if (!p || !cv.view) return;
    setSelectedId(id);
    if (cv.view.scale > HEAT_ABOVE_SCALE) {
      cv.view.goTo({ center: [p.lon, p.lat], scale: ZOOM_IN_TO }).catch(ignoreInterrupt);
    }
  };

  const itemCount = pins.reduce((a, p) => a + p.listings.length, 0);
  const error = cv.error ?? (buildingsError && `Couldn't load Princeton's dorm buildings: ${buildingsError}`);

  return (
    <div className={s.root}>
      <FilterPanel
        filters={filters}
        onChange={(f) => {
          setFilters(f);
          setSelectedId(null); // a new search starts with the map, not an old gallery
        }}
        buildings={buildings ?? []}
        sellersByCollege={sellersByCollege}
        sellerCount={pins.length}
        itemCount={itemCount}
        open={filtersOpen}
      />

      <div className={s.stage}>
        <div ref={mapEl} className={s.map} />

        <button className={s.fbtn} onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
          {filtersOpen ? "Close filters" : "Filters"}
        </button>

        {error ? (
          <div className={s.error} role="alert">
            {error}{" "}
            {buildingsError && (
              <button
                style={{ textDecoration: "underline" }}
                onClick={() => {
                  setBuildingsError(null);
                  setBuildingsTry((n) => n + 1);
                }}
              >
                Retry
              </button>
            )}
          </div>
        ) : (
          cv.ready &&
          buildings && (
            <div className={s.banner} role="status">
              {mode === "heat" && (
                <>
                  <b>{itemCount} items</b> across campus. Zoom in or click a hot spot to see sellers.
                </>
              )}
              {mode === "dots" && (itemFilter ? <>Zoom in closer to see items on each pin.</> : <>Filter by what you want to see items on the pins.</>)}
              {mode === "photos" && (
                <>
                  <b>{pins.length} sellers</b> have what you&rsquo;re looking for. Click a photo to see everything.
                </>
              )}
            </div>
          )
        )}
        {unresolved.length > 0 && (
          <div className={s.error} role="alert" style={{ top: "auto", bottom: 12 }}>
            {unresolved.length} seller{unresolved.length === 1 ? "'s" : "s'"} building isn&rsquo;t on Princeton&rsquo;s map, so they aren&rsquo;t shown:{" "}
            {unresolved.map((u) => `${u.id} (“${u.building}”)`).join(", ")}
          </div>
        )}

        {cv.view && (
          <div className={s.overlay}>
            {mode === "photos" && !selected && <PhotoPins view={cv.view} pins={pins} frame={cv.frame} onSelect={setSelectedId} />}
            {selected && (
              <SellerGallery
                view={cv.view}
                frame={cv.frame}
                pin={selected}
                totalListings={totalBySeller.get(selected.seller.id) ?? selected.listings.length}
                filtered={selected.listings.length < (totalBySeller.get(selected.seller.id) ?? 0)}
                directionsUnlocked={acceptedSellerIds.includes(selected.seller.id)}
                onClose={() => setSelectedId(null)}
                onWalk={() => {
                  setTo(selected.building.name);
                  setPanel({ open: true, tab: "directions" });
                  if (from) goRoute(from, selected.building.name);
                }}
                onOpenListing={onOpenListing}
                onOpenSeller={onOpenSeller}
              />
            )}
          </div>
        )}

        {panel.open ? (
          <SidePanel
            tab={panel.tab}
            onTab={(tab) => setPanel({ open: true, tab })}
            onCollapse={() => setPanel((p) => ({ ...p, open: false }))}
            buildings={buildings ?? []}
            pins={pins}
            from={from}
            to={to}
            stepFree={stepFree}
            onFrom={(v) => {
              setFrom(v);
              setRoute({ status: "idle" });
            }}
            onTo={(v) => {
              setTo(v);
              setRoute({ status: "idle" });
            }}
            onStepFree={(v) => {
              setStepFree(v);
              setRoute({ status: "idle" });
            }}
            onGo={() => goRoute()}
            route={route}
            onPickSeller={pickSeller}
          />
        ) : (
          <button className={s.reopen} onClick={() => setPanel((p) => ({ ...p, open: true }))}>
            Nearby &amp; directions
          </button>
        )}

        {cv.ready && (
          <div className={s.legend} aria-label="Legend">
            {mode === "heat" ? (
              <div className={s.legrow}>
                <span>fewer</span>
                <i className={s.heatbar} />
                <span>more items</span>
              </div>
            ) : (
              <>
                <div className={s.legrow}>
                  {DEPTS.map((d) => (
                    <span key={d}>
                      <i className={s.swatch} style={{ background: DEPT_COLOR[d] }} />
                      {d}
                    </span>
                  ))}
                </div>
                <div className={s.legrow}>
                  <span className={s.sizes}>
                    <i style={{ width: 9, height: 9 }} />
                    <i style={{ width: 14, height: 14 }} />
                    <i style={{ width: 20, height: 20 }} />
                  </span>
                  <span>dot size = items for sale</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
