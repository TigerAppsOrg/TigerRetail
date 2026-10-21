import Link from "next/link";
import { formatCents } from "@/lib/rules";

export interface CardListing {
  id: string;
  title: string;
  priceCents: number;
  size: string;
  brand: string;
  photoUrls: string[];
  status: string;
}

/* The wireframe's productCard(): cover photo, name + price, size · brand.
   Hearts ("saved") aren't built yet, so the heart badge is left out. */
export function ListingCard({ listing: l, badge }: { listing: CardListing; badge?: string }) {
  const meta = [l.size && l.size !== "n/a" ? l.size : null, l.brand || null].filter(Boolean).join(" · ");
  return (
    <Link className="card" href={`/listings/${l.id}`}>
      <div className="ph">
        {/* eslint-disable-next-line @next/next/no-img-element -- photos are already downscaled on upload; see SellFlow */}
        <img src={l.photoUrls[0]} alt="" loading="lazy" />
        {l.status === "sold" && <span className="ph-badge chip chip-sold">sold</span>}
        {badge && l.status !== "sold" && <span className="ph-badge chip">{badge}</span>}
      </div>
      <div className="card-text">
        <div className="card-name">
          <b>{l.title}</b>
          <span>{formatCents(l.priceCents)}</span>
        </div>
        {meta && <div className="card-meta">{meta}</div>}
      </div>
    </Link>
  );
}
