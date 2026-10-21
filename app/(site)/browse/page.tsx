import Link from "next/link";
import { Suspense } from "react";
import { browse, mapFor } from "@/lib/data";
import { APPAREL, APPAREL_DEPTS, filtersFromParams, isSection, subsOf } from "@/lib/catalog";
import type { Section } from "@/components/campus-map/types";
import { Results, moreHref } from "../_components/Results";
import { SubChips } from "../_components/SubChips";
import { LiveMap } from "../map/LiveMap";

/* 60 a page: divisible by every column count the grid can have (2–5, 6 just
   in case), so rows are always full until the very end of the results */
const PAGE = 60;

/* A section (or search) with its subcategory chips and filter row, shown as a
   list or on the campus map. The nav's underline already says which section,
   so there's no big title. */
export default function BrowsePage({ searchParams }: PageProps<"/browse">) {
  return (
    <Suspense
      fallback={
        <div className="wf">
          <div className="wrap">
            <p className="sub">loading listings…</p>
          </div>
        </div>
      }
    >
      <Browse searchParams={searchParams} />
    </Suspense>
  );
}

async function Browse({ searchParams }: { searchParams: PageProps<"/browse">["searchParams"] }) {
  const q = await searchParams;
  const one = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : "");
  const search = one("q").trim();
  const cat = !search && isSection(one("cat")) ? one("cat") : "";
  const rawSubs = Array.isArray(q.sub) ? q.sub : q.sub ? [q.sub] : [];
  const subs = cat ? subsOf(cat).filter((s) => rawSubs.includes(s)) : []; // catalog order, unknown ones dropped
  const hasDept = !cat || APPAREL.has(cat as Section);
  const dept = hasDept && (APPAREL_DEPTS as readonly string[]).includes(one("dept")) ? one("dept") : "all";
  const view = one("view") === "map" ? "map" : "list";
  const filters = filtersFromParams(q);
  const limit = Math.min(Math.max(Number(q.n) || PAGE, PAGE), 400);
  const result = await browse({ section: cat || undefined, subs, dept, q: search, filters, limit });
  const map = view === "map" ? await mapFor(result.matches) : null;

  return (
    <>
      <div className="wf">
        <div className="wrap" style={{ paddingTop: 18 }}>
          {search && (
            <div className="crumbbar">
              <div className="crumb">
                search / <b>{search}</b> &middot;{" "}
                <Link className="crumb-link" href="/">
                  clear search
                </Link>
              </div>
            </div>
          )}
          {cat && <SubChips section={cat} subs={subsOf(cat)} picked={subs} />}
          <Results
            result={result}
            filters={filters}
            dept={hasDept ? dept : null}
            view={view}
            moreHref={moreHref("/browse", q, result.items.length, PAGE)}
          />
        </div>
      </div>
      {map && (
        // outside .wf so the wireframe's element styles don't touch the ArcGIS widgets
        <div className="map-embed">
          <LiveMap sellers={map.sellers} listings={map.listings} />
        </div>
      )}
    </>
  );
}
