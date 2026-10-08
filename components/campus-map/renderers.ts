import HeatmapRenderer from "@arcgis/core/renderers/HeatmapRenderer";
import UniqueValueRenderer from "@arcgis/core/renderers/UniqueValueRenderer";
import SizeVariable from "@arcgis/core/renderers/visualVariables/SizeVariable";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol";
import { DEPTS, DEPT_COLOR } from "./logic/catalog";

/* Campus scale: where are things being sold. Weighted by item count, so a
   senior clearing out a whole room glows brighter than one desk lamp. */
export const heatRenderer = () =>
  new HeatmapRenderer({
    field: "count",
    radius: 26,
    minDensity: 0,
    maxDensity: 0.25,
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
