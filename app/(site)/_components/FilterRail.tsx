"use client";
/* The browse filter row:
     [all · women · men · unisex]  size  price  more filters (n)   13 items  [list | map]  sort
   Department only shows on apparel sections. Size and price are what people
   filter by most, so they stay out; brand, condition and occasion fold into
   "more filters". Everything lives in the URL, so the server does the
   filtering (lib/catalog) and views are shareable. */
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { FACETS, PRICE_BANDS, SHOP_DEPTS, SORTS, type Facet, type Filters } from "@/lib/catalog";
import { Icon } from "./Icon";
import { useUrlSelection } from "./useUrlSelection";

const KEYS = [...FACETS, "sort"];
const UP_FRONT: Facet[] = ["size", "price"];
const FOLDED: Facet[] = ["brand", "condition", "occasion"];
const LABEL: Record<Facet, string> = { size: "size", brand: "brand", price: "price", condition: "condition", occasion: "occasion" };
const fmt = (k: Facet, v: string) => (k === "price" ? (PRICE_BANDS.find(([b]) => b === v)?.[1] ?? v) : v);

export function FilterRail({
  options,
  filters,
  dept,
  view,
  total,
}: {
  options: Partial<Record<Facet, string[]>>;
  filters: Filters;
  dept: string | null; // null: this section has no departments
  view: "list" | "map";
  total: number;
}) {
  const fromServer = useMemo(
    () => ({ ...Object.fromEntries(FACETS.map((k) => [k, filters[k]])), sort: filters.sort === "recency" ? [] : [filters.sort] }),
    [filters],
  );
  const { selection, toggle, set, clear } = useUrlSelection(KEYS, fromServer);
  const router = useRouter();
  const path = usePathname();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const sel = (k: Facet) => selection[k] ?? [];
  const sort = selection.sort?.[0] ?? "recency";

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!railRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  /* single-choice params (department, list/map) */
  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(window.location.search);
    if (v) p.set(k, v);
    else p.delete(k);
    if (k === "dept") p.delete("n");
    startTransition(() => router.replace(`${path}${p.size ? `?${p}` : ""}`, { scroll: false }));
  };

  const upFront = UP_FRONT.filter((k) => options[k]);
  const folded = FOLDED.filter((k) => options[k]);
  const foldedOn = folded.reduce((n, k) => n + sel(k).length, 0);
  const pills = [...upFront, ...folded].flatMap((k) => sel(k).map((v) => ({ k, v })));

  const checkboxes = (k: Facet) =>
    options[k]!.map((v) => (
      <label key={v} className={`ms-opt ${sel(k).includes(v) ? "on" : ""}`}>
        <input type="checkbox" checked={sel(k).includes(v)} onChange={() => toggle(k, v)} />
        <span>{fmt(k, v)}</span>
      </label>
    ));

  return (
    <div ref={railRef}>
      <div className="rail-controls">
        <div className="fgroup">
          {dept !== null && (
            <div className="seg" role="group" aria-label="department">
              {SHOP_DEPTS.map(([v, t]) => (
                <button key={v} className={dept === v ? "on" : ""} aria-pressed={dept === v} onClick={() => setParam("dept", v === "all" ? null : v)}>
                  {t}
                </button>
              ))}
            </div>
          )}
          {upFront.map((k) => {
            const picked = sel(k);
            const isOpen = open === k;
            const summary = !picked.length ? (k === "price" ? "any price" : "all") : picked.length === 1 ? fmt(k, picked[0]) : `${picked.length} picked`;
            return (
              <div key={k} className={`ms ${isOpen ? "open" : ""}`}>
                <button className={`ms-btn ${picked.length ? "on" : ""}`} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : k)}>
                  <span className="ms-label">{LABEL[k]}</span>
                  <span className="ms-val">{summary}</span>
                  <Icon name="down" />
                </button>
                {isOpen && (
                  <div className="ms-panel">
                    <button className="ms-clear" onClick={() => set(k, [])}>
                      {picked.length ? `clear all ${LABEL[k]}` : "show all"}
                    </button>
                    {checkboxes(k)}
                  </div>
                )}
              </div>
            );
          })}
          {folded.length > 0 && (
            <div className={`ms ${open === "more" ? "open" : ""}`}>
              <button className={`ms-btn ${foldedOn ? "on" : ""}`} aria-expanded={open === "more"} onClick={() => setOpen(open === "more" ? null : "more")}>
                <span className="ms-val">more filters</span>
                {foldedOn > 0 && <i className="badge">{foldedOn}</i>}
                <Icon name="down" />
              </button>
              {open === "more" && (
                <div className="ms-panel more-panel">
                  {folded.map((k) => (
                    <div key={k}>
                      <h4>{LABEL[k]}</h4>
                      {checkboxes(k)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <span className="count">
          {total} item{total === 1 ? "" : "s"}
        </span>
        <div className="seg" role="group" aria-label="view">
          <button className={view === "list" ? "on" : ""} aria-pressed={view === "list"} onClick={() => setParam("view", null)}>
            list
          </button>
          <button className={view === "map" ? "on" : ""} aria-pressed={view === "map"} onClick={() => setParam("view", "map")}>
            <Icon name="map" /> map
          </button>
        </div>
        <label className="fsel sortsel">
          sort by
          <select value={sort} onChange={(e) => set("sort", e.target.value === "recency" ? [] : [e.target.value])}>
            {SORTS.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      {pills.length > 0 && (
        <div className="pills">
          {pills.map(({ k, v }) => (
            <button key={`${k}:${v}`} className="pill" onClick={() => toggle(k, v)}>
              {k === "size" ? "size " : ""}
              {fmt(k, v)} <Icon name="x" />
            </button>
          ))}
          <button className="pill clear" onClick={() => clear([...upFront, ...folded])}>
            clear all
          </button>
        </div>
      )}
    </div>
  );
}
