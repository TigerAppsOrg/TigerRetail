/* Princeton's public GIS services. None of these need an API key. */
import * as route from "@arcgis/core/rest/route";
import RouteParameters from "@arcgis/core/rest/support/RouteParameters";
import FeatureSet from "@arcgis/core/rest/support/FeatureSet";
import TravelMode from "@arcgis/core/rest/support/TravelMode";
import Graphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import type Polyline from "@arcgis/core/geometry/Polyline";
import type { Building } from "./types";
import { polygonCentroid } from "./logic/geo";

/* "Facilities Interactive Campus Map WM": the same map as Princeton's own
   interactive campus map, with the TigermapPRD basemap. */
export const CAMPUS_WEBMAP_ID = "9f7ccf267b5b4037aac0332332e7d2e4";

const BUILDINGS_URL = "https://facgisprd.princeton.edu/server/rest/services/Building/Buildings/MapServer/0";
const ROUTE_URL = "https://facgisprd.princeton.edu/routing/rest/services/Routing/NetworkAnalysis/NAServer/Route";

interface RawBuilding {
  attributes: { NAME: string; COLLEGE: string };
  geometry: { rings: number[][][] };
}

const ringArea = (r: number[][]) =>
  Math.abs(r.slice(0, -1).reduce((a, [x0, y0], i) => a + x0 * r[i + 1][1] - r[i + 1][0] * y0, 0)) / 2;

/* Every building Princeton tags with a residential college: the dorms. */
export async function fetchResidentialBuildings(signal?: AbortSignal): Promise<Building[]> {
  const q = new URLSearchParams({
    where: "COLLEGE <> 'N/A'",
    outFields: "NAME,COLLEGE",
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
  });
  const res = await fetch(`${BUILDINGS_URL}/query?${q}`, { signal });
  if (!res.ok) throw new Error(`Princeton Buildings layer returned HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`Princeton Buildings layer: ${body.error.message}`);

  return (body.features as RawBuilding[]).map((f) => {
    // multi-part buildings: centre on the biggest part
    const ring = f.geometry.rings.reduce((a, b) => (ringArea(b) > ringArea(a) ? b : a));
    const [lon, lat] = polygonCentroid(ring);
    return { name: f.attributes.NAME, college: f.attributes.COLLEGE, lon, lat };
  });
}

export interface WalkingRoute {
  path: Polyline;
  minutes: number;
  feet: number;
  steps: string[];
}

let travelModes: Promise<Record<string, TravelMode>> | null = null;

/* "Walking" and "Step Free Walking may include steep slopes" are the two
   modes Princeton's network publishes. */
function loadTravelModes() {
  travelModes ??= fetch(`${ROUTE_URL}?f=json`)
    .then((r) => r.json())
    .then((body) => {
      if (body.error) throw new Error(`Princeton routing: ${body.error.message}`);
      return Object.fromEntries(
        (body.supportedTravelModes as { name: string }[]).map((m) => [m.name, TravelMode.fromJSON(m)]),
      );
    })
    .catch((e) => {
      travelModes = null; // let the next attempt retry
      throw e;
    });
  return travelModes;
}

export async function solveWalkingRoute(from: Building, to: Building, stepFree: boolean): Promise<WalkingRoute> {
  const modes = await loadTravelModes();
  const name = Object.keys(modes).find((n) => (stepFree ? /step free/i.test(n) : /^walking$/i.test(n)));
  if (!name) throw new Error(`Princeton routing has no ${stepFree ? "step-free" : "walking"} travel mode`);

  const stop = (b: Building) =>
    new Graphic({ attributes: { Name: b.name }, geometry: new Point({ longitude: b.lon, latitude: b.lat }) });

  const result = await route.solve(
    ROUTE_URL,
    new RouteParameters({
      stops: new FeatureSet({ features: [stop(from), stop(to)] }),
      travelMode: modes[name],
      returnDirections: true,
      returnRoutes: true,
    }),
  );

  const r = result.routeResults[0];
  const attrs = r?.route?.attributes;
  if (!r?.route?.geometry || attrs?.Total_WalkTimeMin == null || attrs?.Total_LengthFt == null) {
    throw new Error("Princeton routing returned no route between those buildings");
  }
  return {
    path: r.route.geometry as Polyline,
    minutes: attrs.Total_WalkTimeMin,
    feet: attrs.Total_LengthFt,
    steps: (r.directions?.features ?? []).map((f) => String(f.attributes.text)),
  };
}
