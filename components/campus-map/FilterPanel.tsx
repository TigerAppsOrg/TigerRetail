"use client";
import { useState, type ReactNode } from "react";
import type { Building, Dept, Filters, Recency, Section } from "./types";
import { DEPTS, DEPT_COLOR, RECENCY, SECTIONS, tidyCollege } from "./logic/catalog";
import s from "./campus-map.module.css";

const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
const SUBS_OF = new Map(SECTIONS);

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

/* A collapsible filter section. Collapsed, it still says how many of its
   filters are on, so nothing is hidden silently. */
function Group(p: { title: string; active: number; onClear: () => void; children: ReactNode }) {
  const [expanded, setExpanded] = useState(true);
  const id = `fgrp-${p.title.toLowerCase()}`;
  return (
    <section className={s.grp}>
      <div className={s.glabel}>
        <button className={s.gtoggle} aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((e) => !e)}>
          <svg className={s.chev} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
          {p.title}
          {p.active > 0 && <span className={s.gcount}>{p.active}</span>}
        </button>
        {p.active > 0 && (
          <button className={s.clear} onClick={p.onClear}>
            clear
          </button>
        )}
      </div>
      {expanded && (
        <div id={id} className={s.gbody2}>
          {p.children}
        </div>
      )}
    </section>
  );
}

/* Options that belong to one parent choice (a section's types, a college's
   halls), under that parent's name with a rule above, so two open at once
   never blur together. */
function SubGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={s.subgrp} role="group" aria-label={label}>
      <div className={s.sublabel}>{label}</div>
      <div className={s.chips}>{children}</div>
    </div>
  );
}

export function FilterPanel({ filters: f, onChange, buildings, sellersByCollege, sellerCount, itemCount, open, onClose }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...f, ...patch });

  const toggleSection = (sec: Section) => {
    const sections = toggle(f.sections, sec);
    // dropping a section drops its subs too
    const keep = new Set(sections.flatMap((x) => SUBS_OF.get(x)!));
    set({ sections, subs: f.subs.filter((x) => keep.has(x)) });
  };

  const toggleCollege = (c: string) => {
    const colleges = toggle(f.colleges, c);
    // dropping a college drops its halls too
    const inNext = new Set(buildings.filter((b) => colleges.includes(tidyCollege(b.college))).map((b) => b.name));
    set({ colleges, buildings: f.buildings.filter((b) => inNext.has(b)) });
  };

  const colleges = [...new Set(buildings.map((b) => tidyCollege(b.college)))].sort();
  const hallsOf = (c: string) =>
    buildings
      .filter((b) => tidyCollege(b.college) === c)
      .map((b) => b.name)
      .sort();

  // sub-groups appear in the order their parents were picked
  const openSections = f.sections.filter((sec) => SUBS_OF.get(sec)!.length > 1);

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

      {/* first thing people see: who they're shopping for */}
      <Group title="Gender" active={f.depts.length} onClear={() => set({ depts: [] })}>
        <div className={s.chips}>
          {DEPTS.map((d: Dept) => (
            <button key={d} className={s.chip} aria-pressed={f.depts.includes(d)} onClick={() => set({ depts: toggle(f.depts, d) })}>
              <i className={s.swatch} style={{ background: DEPT_COLOR[d] }} />
              {d}
            </button>
          ))}
        </div>
      </Group>

      <Group title="What" active={f.sections.length + f.subs.length} onClear={() => set({ sections: [], subs: [] })}>
        <div className={s.chips}>
          {SECTIONS.map(([sec]) => (
            <button key={sec} className={s.chip} aria-pressed={f.sections.includes(sec)} onClick={() => toggleSection(sec)}>
              {sec}
            </button>
          ))}
        </div>
        {openSections.map((sec) => (
          <SubGroup key={sec} label={sec}>
            {SUBS_OF.get(sec)!.map((sub) => (
              <button key={sub} className={s.subchip} aria-pressed={f.subs.includes(sub)} onClick={() => set({ subs: toggle(f.subs, sub) })}>
                {sub}
              </button>
            ))}
          </SubGroup>
        ))}
      </Group>

      <Group title="Where" active={f.colleges.length + f.buildings.length} onClear={() => set({ colleges: [], buildings: [] })}>
        <div className={s.chips}>
          {colleges.map((c) => (
            <button key={c} className={s.chip} aria-pressed={f.colleges.includes(c)} onClick={() => toggleCollege(c)}>
              {c.replace(/ College$/, "")}
              <span className={s.n}>{sellersByCollege.get(c) ?? 0}</span>
            </button>
          ))}
        </div>
        {f.colleges.map((c) => (
          <SubGroup key={c} label={`${c} halls`}>
            {hallsOf(c).map((h) => (
              <button key={h} className={s.subchip} aria-pressed={f.buildings.includes(h)} onClick={() => set({ buildings: toggle(f.buildings, h) })}>
                {h}
              </button>
            ))}
          </SubGroup>
        ))}
      </Group>

      <Group title="Posted" active={f.recency === "any" ? 0 : 1} onClear={() => set({ recency: "any" })}>
        <select className={s.select} value={f.recency} onChange={(e) => set({ recency: e.target.value as Recency })} aria-label="Posted within">
          {RECENCY.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </Group>

      {any ? (
        /* pinned to the bottom of the sidebar, so it's reachable however many sections are open */
        <div className={s.clearall}>
          <button className={s.outline} onClick={() => onChange({ sections: [], subs: [], depts: [], colleges: [], buildings: [], recency: "any" })}>
            Clear all filters
          </button>
        </div>
      ) : (
        <p className={s.hint}>Pick what you&rsquo;re looking for, then zoom in: each seller&rsquo;s items show up on their pin.</p>
      )}
    </aside>
  );
}
