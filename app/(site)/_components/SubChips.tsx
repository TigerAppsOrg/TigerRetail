"use client";
import { useMemo } from "react";
import { useUrlSelection } from "./useUrlSelection";

const KEYS = ["sub"];

/* Subcategory chips: click to add, click again to remove; "all …" clears. */
export function SubChips({ section, subs, picked }: { section: string; subs: string[]; picked: string[] }) {
  const fromServer = useMemo(() => ({ sub: picked }), [picked]);
  const { selection, toggle, clear } = useUrlSelection(KEYS, fromServer);
  const on = selection.sub ?? [];
  return (
    <div className="chips subnav" role="group" aria-label={`${section} types`}>
      <button className={`chipbtn ${on.length === 0 ? "on" : ""}`} aria-pressed={on.length === 0} onClick={() => clear(KEYS)}>
        all {section}
      </button>
      {subs.map((s) => (
        <button key={s} className={`chipbtn ${on.includes(s) ? "on" : ""}`} aria-pressed={on.includes(s)} onClick={() => toggle("sub", s)}>
          {s}
        </button>
      ))}
    </div>
  );
}
