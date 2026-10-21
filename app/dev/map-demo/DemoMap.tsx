"use client";
/* Client-only: the demo data is stamped relative to "now", which can't be
   computed during prerender. Loaded with ssr:false from MapDemo. */
import { useMemo } from "react";
import CampusMap from "@/components/campus-map/CampusMap";
import { demoMarketplace } from "@/fixtures/demoMarketplace";

export default function DemoMap({ count, say }: { count: number; say: (msg: string) => void }) {
  const data = useMemo(() => demoMarketplace(new Date(), count), [count]);
  return (
    <CampusMap
      sellers={data.sellers}
      listings={data.listings}
      /* demo: pretend the first seller accepted your offer, to show unlocked room directions */
      acceptedSellerIds={[data.sellers[0].id]}
      onOpenListing={(l) => say(`In TigerRetail this opens “${l.title}”.`)}
      onOpenSeller={(s) => say(`In TigerRetail this opens ${s.name}'s seller page.`)}
    />
  );
}
