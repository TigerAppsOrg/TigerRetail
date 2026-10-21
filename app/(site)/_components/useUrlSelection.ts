"use client";
/* Multi-select state that lives in the URL (?size=small&size=medium).

   Why not just read useSearchParams on each click: each click navigates, and
   the page's params only update once the server answers. Two quick clicks
   would both start from the old URL, so the second would drop the first.
   Here every click builds on the latest local selection instead, and the
   server's answer is only adopted once it has caught up with it. */
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export type Selection = Record<string, string[]>;

const same = (a: Selection, b: Selection, keys: string[]) => keys.every((k) => (a[k] ?? []).join("\u0000") === (b[k] ?? []).join("\u0000"));

export function useUrlSelection(keys: string[], fromServer: Selection) {
  const router = useRouter();
  const path = usePathname();
  const [, startTransition] = useTransition();
  const [view, setView] = useState<Selection>(fromServer);
  const pending = useRef<Selection | null>(null);

  // adopt the server's selection unless we're still waiting for it to reach ours
  useEffect(() => {
    if (!pending.current || same(pending.current, fromServer, keys)) {
      pending.current = null;
      setView(fromServer);
    }
  }, [fromServer, keys]);

  const commit = (next: Selection) => {
    pending.current = next;
    setView(next);
    // other params (cat, dept, q, the other component's keys) come from the live URL
    const p = new URLSearchParams(window.location.search);
    for (const k of keys) {
      p.delete(k);
      (next[k] ?? []).forEach((v) => p.append(k, v));
    }
    p.delete("n"); // a new selection starts the list from the top
    startTransition(() => router.replace(`${path}${p.size ? `?${p}` : ""}`, { scroll: false }));
  };

  const current = () => pending.current ?? view;
  return {
    selection: view,
    /* click once to add, again to remove */
    toggle: (k: string, v: string) => {
      const cur = current();
      const list = cur[k] ?? [];
      commit({ ...cur, [k]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] });
    },
    set: (k: string, values: string[]) => commit({ ...current(), [k]: values }),
    clear: (ks: string[]) => commit({ ...current(), ...Object.fromEntries(ks.map((k) => [k, []])) }),
  };
}
