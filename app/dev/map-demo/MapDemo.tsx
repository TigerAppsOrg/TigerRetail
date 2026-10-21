"use client";
/* Standalone host for the map while it's built separately from TigerRetail.
   In the main app, this page's job is done by the real browse page: it passes
   real sellers/listings and routes the two callbacks to real pages. */
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { DEFAULT_LISTINGS } from "@/fixtures/demoMarketplace";
import styles from "./demo.module.css";

// The ArcGIS SDK needs window, so the map only ever renders in the browser.
const DemoMap = dynamic(() => import("./DemoMap"), {
  ssr: false,
  loading: () => <div className={styles.loading}>Loading Princeton&rsquo;s campus map…</div>,
});

export default function MapDemo() {
  const [toast, setToast] = useState<string | null>(null);
  // stress test: the slider moves `draft` live; the map regenerates once you stop
  const [draft, setDraft] = useState(DEFAULT_LISTINGS);
  const [count, setCount] = useState(DEFAULT_LISTINGS);
  useEffect(() => {
    const t = setTimeout(() => setCount(draft), 250);
    return () => clearTimeout(t);
  }, [draft]);
  const say = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  };

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <span className={styles.wordmark}>tigerretail</span>
        <span className={styles.tag}>map</span>
        <label className={styles.stress}>
          <span>Stress test</span>
          <input
            type="range"
            min={50}
            max={1000}
            step={50}
            value={draft}
            onChange={(e) => setDraft(Number(e.target.value))}
            aria-label="Demo listings"
          />
          <output>{draft} listings</output>
        </label>
        <span className={styles.note}>prototype · demo sellers on real Princeton dorms</span>
      </header>
      <main className={styles.main}>
        <DemoMap count={count} say={say} />
      </main>
      {toast && (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
