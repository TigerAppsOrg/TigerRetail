"use client";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { Listing, Seller } from "@/components/campus-map/types";

// The ArcGIS SDK needs window, so the map only ever renders in the browser.
const CampusMap = dynamic(() => import("@/components/campus-map/CampusMap"), {
  ssr: false,
  loading: () => <p style={{ padding: 20 }}>Loading Princeton&rsquo;s campus map…</p>,
});

export function LiveMap({ sellers, listings }: { sellers: Seller[]; listings: Listing[] }) {
  const router = useRouter();
  return (
    <CampusMap
      sellers={sellers}
      listings={listings}
      onOpenListing={(l) => router.push(`/listings/${l.id}`)}
      // seller pages are a later slice; their listings are one click away on the map already
      onOpenSeller={(sel) => {
        const first = listings.find((l) => l.sellerId === sel.id);
        if (first) router.push(`/listings/${first.id}`);
      }}
    />
  );
}
