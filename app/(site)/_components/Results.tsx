import Link from "next/link";
import type { BrowseResult } from "@/lib/data";
import type { Filters } from "@/lib/catalog";
import { FilterRail } from "./FilterRail";
import { Icon } from "./Icon";
import { ListingCard } from "./ListingCard";

/* filter row + (in list view) grid and "load more" */
export function Results({
  result,
  filters,
  dept,
  view,
  moreHref,
}: {
  result: BrowseResult;
  filters: Filters;
  dept: string | null;
  view: "list" | "map";
  moreHref: string;
}) {
  const { items, total, activeFilters } = result;
  return (
    <>
      <div className="rail" style={{ borderTop: 0 }}>
        <FilterRail options={result.options} filters={filters} dept={dept} view={view} total={total} />
      </div>
      {view === "list" && (
        <>
          {items.length ? (
            <div className="grid">
              {items.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          ) : (
            <div className="empty">{activeFilters ? "nothing matches those filters. try clearing one." : "nothing listed here yet."}</div>
          )}
          {total > items.length ? (
            <Link className="more" href={moreHref} scroll={false}>
              <Icon name="down" />
              <span style={{ fontSize: 13 }}>load more</span>
            </Link>
          ) : items.length ? (
            <p className="sub" style={{ textAlign: "center", padding: "24px 0", maxWidth: "none" }}>
              that&rsquo;s everything matching.
            </p>
          ) : null}
          <div style={{ height: 70 }} />
        </>
      )}
    </>
  );
}

/* the same URL with ?n= raised by one page */
export function moreHref(path: string, q: Record<string, string | string[] | undefined>, shown: number, page: number) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (k === "n" || v === undefined) continue;
    (Array.isArray(v) ? v : [v]).forEach((x) => p.append(k, x));
  }
  p.set("n", String(shown + page));
  return `${path}?${p}`;
}
