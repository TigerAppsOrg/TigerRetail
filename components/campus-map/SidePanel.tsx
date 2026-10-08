"use client";
import type { Building, SellerPin } from "./types";
import type { WalkingRoute } from "./princeton";
import { DEPT_COLOR, tidyCollege } from "./logic/catalog";
import { sortByDistance } from "./logic/pins";
import s from "./campus-map.module.css";

export type RouteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; route: WalkingRoute }
  | { status: "error"; message: string };

interface Props {
  tab: "nearby" | "directions";
  onTab: (t: "nearby" | "directions") => void;
  onCollapse: () => void;
  buildings: Building[];
  pins: SellerPin[];
  from: string;
  to: string;
  stepFree: boolean;
  onFrom: (b: string) => void;
  onTo: (b: string) => void;
  onStepFree: (v: boolean) => void;
  onGo: () => void;
  route: RouteState;
  onPickSeller: (id: string) => void;
}

function BuildingSelect({ value, onChange, buildings, label, placeholder }: { value: string; onChange: (v: string) => void; buildings: Building[]; label: string; placeholder: string }) {
  const byCollege = new Map<string, Building[]>();
  for (const b of buildings) {
    const c = tidyCollege(b.college);
    byCollege.set(c, [...(byCollege.get(c) ?? []), b]);
  }
  return (
    <div className={s.field}>
      <label>{label}</label>
      <select className={s.select} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">{placeholder}</option>
        {[...byCollege.keys()].sort().map((c) => (
          <optgroup key={c} label={c}>
            {byCollege
              .get(c)!
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

const miles = (m: number) => (m < 160 ? `${Math.round(m * 3.281)} ft` : `${(m / 1609.34).toFixed(2)} mi`);

export function SidePanel(p: Props) {
  const fromB = p.buildings.find((b) => b.name === p.from);
  const nearby = fromB ? sortByDistance(p.pins, fromB).slice(0, 12) : [];

  return (
    <section className={s.panel} aria-label="Nearby and directions">
      <div className={s.tabs} role="tablist">
        <button role="tab" aria-selected={p.tab === "nearby"} onClick={() => p.onTab("nearby")}>
          Nearby
        </button>
        <button role="tab" aria-selected={p.tab === "directions"} onClick={() => p.onTab("directions")}>
          Directions
        </button>
        <button className={s.collapse} onClick={p.onCollapse} aria-label="Hide panel">
          ✕
        </button>
      </div>

      <div className={s.pbody}>
        <BuildingSelect label="YOU'RE AT" value={p.from} onChange={p.onFrom} buildings={p.buildings} placeholder="Pick your dorm…" />

        {p.tab === "nearby" &&
          (fromB ? (
            nearby.length ? (
              <div className={s.near}>
                {nearby.map(({ pin, meters }) => (
                  <button key={pin.seller.id} className={s.nearrow} onClick={() => p.onPickSeller(pin.seller.id)}>
                    <i className={s.swatch} style={{ background: DEPT_COLOR[pin.dept] }} />
                    <span>
                      <b>{pin.seller.name}</b>
                      <small>
                        {pin.listings.length} item{pin.listings.length === 1 ? "" : "s"} · {pin.building.name}
                      </small>
                    </span>
                    <em>{miles(meters)}</em>
                  </button>
                ))}
              </div>
            ) : (
              <p className={s.hint}>No sellers match your filters.</p>
            )
          ) : (
            <p className={s.hint}>Pick where you are to see who&rsquo;s selling closest (straight-line distance).</p>
          ))}

        {p.tab === "directions" && (
          <>
            <BuildingSelect label="TO" value={p.to} onChange={p.onTo} buildings={p.buildings} placeholder="Pick a building, or “Walk here” on a seller" />
            <label className={s.toggle}>
              <input type="checkbox" checked={p.stepFree} onChange={(e) => p.onStepFree(e.target.checked)} />
              Step-free route (may include steep slopes)
            </label>
            <button className={s.primary} disabled={!p.from || !p.to || p.from === p.to || p.route.status === "loading"} onClick={p.onGo}>
              {p.route.status === "loading" ? "Finding route…" : "Get walking directions"}
            </button>
            {p.route.status === "error" && <p className={s.perr}>{p.route.message}</p>}
            {p.route.status === "done" && (
              <>
                <div className={s.summary}>
                  <b>{Math.max(1, Math.round(p.route.route.minutes))} min</b>
                  <span className={s.count}>{(p.route.route.feet / 5280).toFixed(2)} mi walk</span>
                </div>
                <ol className={s.steps}>
                  {p.route.route.steps.map((t, i) => (
                    <li key={i}>{t.replace(/Location 1/, p.from).replace(/Location 2/, p.to)}</li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
