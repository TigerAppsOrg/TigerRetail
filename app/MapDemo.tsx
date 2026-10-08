"use client";
/* Standalone host for the map while it's built separately from TigerRetail.
   In the main app, this page's job is done by the real browse page: it passes
   real sellers/listings and routes the two callbacks to real pages. */
import dynamic from "next/dynamic";
import { useState } from "react";
import styles from "./demo.module.css";

// The ArcGIS SDK needs window, so the map only ever renders in the browser.
const DemoMap = dynamic(() => import("./DemoMap"), {
  ssr: false,
  loading: () => <div className={styles.loading}>Loading Princeton&rsquo;s campus map…</div>,
});

export default function MapDemo() {
  const [toast, setToast] = useState<string | null>(null);
  const say = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  };

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <span className={styles.wordmark}>tigerretail</span>
        <span className={styles.tag}>map</span>
        <span className={styles.note}>prototype · demo sellers on real Princeton dorms</span>
      </header>
      <main className={styles.main}>
        <DemoMap say={say} />
      </main>
      {toast && (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
