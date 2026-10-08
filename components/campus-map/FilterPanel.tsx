"use client";
import type { Building, Dept, Filters, Recency, Section } from "./types";
import { DEPTS, DEPT_COLOR, RECENCY, SECTIONS, tidyCollege } from "./logic/catalog";
import s from "./campus-map.module.css";

const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  buildings: Building[];
  sellersByCollege: Map<string, number>;
  sellerCount: number;
  itemCount: number;
  open: boolean;
  onClose: () => void;
}

export function FilterPanel({ filters: f, onChange, buildings, sellersByCollege, sellerCount, itemCount, open, onClose }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...f, ...patch });

  const toggleSection = (sec: Section) => {
    const sections = toggle(f.sections, sec);
    // dropping a section drops its subs too
    const keep = new Set(sections.flatMap((x) => SECTIONS.find(([n]) => n === x)![1]));
    set({ sections, subs: f.subs.filter((x) => keep.has(x)) });
  };

  const colleges = [...new Set(buildings.map((b) => tidyCollege(b.college)))].sort();
  const halls = buildings
    .filter((b) => f.colleges.includes(tidyCollege(b.college)))
    .map((b) => b.name)
    .sort();

  const any = f.sections.length || f.subs.length || f.depts.length || f.colleges.length || f.buildings.length || f.recency !== "any";

  return (
    <aside className={`${s.filters} ${open ? s.open : ""}`} aria-label="Map filters">
      <div className={s.fhead}>
        <h2>Filters</h2>
        <span className={s.count}>
          {sellerCount} sellers · {itemCount} items
        </span>
        <button className={s.fclose} onClick={onClose} aria-label="Close filters">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className={s.grp}>
        <div className={s.glabel}>
          What
          {(f.sections.length > 0 || f.subs.length > 0) && (
            <button className={s.clear} onClick={() => set({ sections: [], subs: [] })}>
              clear
            </button>
          )}
        </div>
        <div className={s.chips}>
          {SECTIONS.map(([sec]) => (
            <button key={sec} className={s.chip} aria-pressed={f.sections.includes(sec)} onClick={() => toggleSection(sec)}>
              {sec}
            </button>
          ))}
        </div>
        {SECTIONS.filter(([sec, subs]) => f.sections.includes(sec) && subs.length > 1).map(([sec, subs]) => (
          <div key={sec} className={s.chips} aria-label={`${sec} types`}>
            {subs.map((sub) => (
              <button key={sub} className={s.subchip} aria-pressed={f.subs.includes(sub)} onClick={() => set({ subs: toggle(f.subs, sub) })}>
                {sub}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className={s.grp}>
        <div className={s.glabel}>
          Department
          {f.depts.length > 0 && (
            <button className={s.clear} onClick={() => set({ depts: [] })}>
              clear
            </button>
          )}
        </div>
        <div className={s.chips}>
          {DEPTS.map((d: Dept) => (
            <button key={d} className={s.chip} aria-pressed={f.depts.includes(d)} onClick={() => set({ depts: toggle(f.depts, d) })}>
              <i className={s.swatch} style={{ background: DEPT_COLOR[d] }} />
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className={s.grp}>
        <div className={s.glabel}>
          Where
          {(f.colleges.length > 0 || f.buildings.length > 0) && (
            <button className={s.clear} onClick={() => set({ colleges: [], buildings: [] })}>
              clear
            </button>
          )}
        </div>
        <div className={s.chips}>
          {colleges.map((c) => (
            <button
              key={c}
              className={s.chip}
              aria-pressed={f.colleges.includes(c)}
              onClick={() => {
                const next = toggle(f.colleges, c);
                const inNext = new Set(buildings.filter((b) => next.includes(tidyCollege(b.college))).map((b) => b.name));
                set({ colleges: next, buildings: f.buildings.filter((b) => inNext.has(b)) });
              }}
            >
              {c.replace(/ College$/, "")}
              <span className={s.n}>{sellersByCollege.get(c) ?? 0}</span>
            </button>
          ))}
        </div>
        {halls.length > 0 && (
          <div className={s.chips} aria-label="Halls">
            {halls.map((h) => (
              <button key={h} className={s.subchip} aria-pressed={f.buildings.includes(h)} onClick={() => set({ buildings: toggle(f.buildings, h) })}>
                {h}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={s.grp}>
        <div className={s.glabel}>Posted</div>
        <select className={s.select} value={f.recency} onChange={(e) => set({ recency: e.target.value as Recency })} aria-label="Posted within">
          {RECENCY.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {any ? (
        <button className={s.outline} onClick={() => onChange({ sections: [], subs: [], depts: [], colleges: [], buildings: [], recency: "any" })}>
          Clear all filters
        </button>
      ) : (
        <p className={s.hint}>Pick what you&rsquo;re looking for, then zoom in: each seller&rsquo;s items show up on their pin.</p>
      )}
    </aside>
  );
}
