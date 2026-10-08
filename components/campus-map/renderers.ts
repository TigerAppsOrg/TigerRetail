import HeatmapRenderer from "@arcgis/core/renderers/HeatmapRenderer";
import UniqueValueRenderer from "@arcgis/core/renderers/UniqueValueRenderer";
import SizeVariable from "@arcgis/core/renderers/visualVariables/SizeVariable";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol";
import FeatureReductionCluster from "@arcgis/core/layers/support/FeatureReductionCluster";
import { DEPTS, DEPT_COLOR } from "./logic/catalog";

/* Campus scale: where are things being sold. Weighted by item count, so a
   senior clearing out a whole room glows brighter than one desk lamp.
   Density adds up, so the top of the scale grows with the number of items on
   the map: otherwise 1000 listings is one solid brown blob and 50 is invisible. */
const HEAT_DENSITY_PER_ITEM = 0.06 / 200;
export const heatRenderer = (items: number) =>
  new HeatmapRenderer({
    field: "count",
    radius: 30,
    minDensity: 0,
    maxDensity: HEAT_DENSITY_PER_ITEM * Math.max(items, 60),
    colorStops: [
      { ratio: 0, color: "rgba(223, 90, 30, 0)" },
      { ratio: 0.15, color: "rgba(242, 140, 80, 0.35)" },
      { ratio: 0.4, color: "rgba(223, 90, 30, 0.6)" },
      { ratio: 0.7, color: "rgba(187, 76, 25, 0.8)" },
      { ratio: 1, color: "rgba(122, 42, 10, 0.9)" },
    ],
  });

/* Closer in: a dot per seller. Colour = department, size = matching items. */
export const dotsRenderer = () =>
  new UniqueValueRenderer({
    field: "dept",
    uniqueValueInfos: DEPTS.map((d) => ({
      value: d,
      label: d,
      symbol: new SimpleMarkerSymbol({
        style: "circle",
        color: DEPT_COLOR[d],
        outline: { color: "white", width: 1.5 },
      }),
    })),
    visualVariables: [
      new SizeVariable({
        field: "count",
        stops: [
          { value: 1, size: 11 },
          { value: 4, size: 18 },
          { value: 12, size: 30 },
        ],
      }),
    ],
  });

/* Neighbourhood zoom (1:8000): sellers whose dots would overlap merge into one
   bubble labelled with their total items. Click it to zoom in and split it.
   From 1:4000 in, every seller is their own dot again. */
export const CLUSTER_MAX_SCALE = 5_000;
export const sellerClusters = () =>
  new FeatureReductionCluster({
    clusterRadius: "44px",
    clusterMinSize: "20px",
    clusterMaxSize: "44px",
    popupEnabled: false,
    fields: [{ name: "items", onStatisticField: "count", statisticType: "sum" }],
    labelingInfo: [
      {
        labelExpressionInfo: { expression: "Text($feature.items, '#,###')" },
        labelPlacement: "center-center",
        deconflictionStrategy: "none",
        symbol: {
          type: "text",
          color: "white",
          haloColor: [23, 21, 15, 0.55],
          haloSize: 1,
          font: { size: "11px", weight: "bold", family: "sans-serif" },
        },
      },
    ],
  });
