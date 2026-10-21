import { connection } from "next/server";
import { Suspense } from "react";
import { mapMarketplace } from "@/lib/data";
import { LiveMap } from "./LiveMap";

/* The same map Patrick and Raj built, fed by real listings. */
export default function MapPage() {
  return (
    <div className="map-fill">
      <Suspense fallback={<p style={{ padding: 20, color: "#6b6555" }}>Loading listings…</p>}>
        <MapData />
      </Suspense>
    </div>
  );
}

async function MapData() {
  await connection(); // Load live listings at request time, not during CI builds.
  const { sellers, listings } = await mapMarketplace();
  return <LiveMap sellers={sellers} listings={listings} />;
}
