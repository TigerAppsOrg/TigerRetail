import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { listingsBySeller, offersByBuyer } from "@/lib/data";
import { formatCents } from "@/lib/rules";
import { ListingCard } from "../_components/ListingCard";

/* "my stuff" (wireframe V.you, trimmed): your listings and your offers.
   Drafts, saved items and bulk edit come later. */
export default function MePage() {
  return (
    <div className="wf">
      <div className="wrap" style={{ paddingTop: 24 }}>
        <Suspense fallback={<p className="sub">loading…</p>}>
          <Me />
        </Suspense>
        <div style={{ height: 70 }} />
      </div>
    </div>
  );
}

async function Me() {
  const user = await requireUser("/me");
  const [listings, offers] = await Promise.all([listingsBySeller(user.netid), offersByBuyer(user.netid)]);
  const current = listings.filter((l) => l.status === "active");
  const sold = listings.filter((l) => l.status === "sold");
  return (
    <>
      <div className="sect">
        <div className="sec-head">
          <h1 className="sec-title">current listings</h1>
          <Link className="link-act" href="/profile">
            edit your profile
          </Link>
        </div>
        <p className="sub">what you have up right now. open one to see its offers.</p>
        {current.length ? (
          <div className="grid">
            {current.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <div className="empty">
            nothing listed. <Link href="/sell">sell something</Link>
          </div>
        )}
      </div>

      <div className="sect">
        <h2 className="sec-title">my offers</h2>
        <p className="sub">things you&rsquo;ve offered on, and where each one stands.</p>
        {offers.length ? (
          <div className="offerlist">
            {offers.map((o) => (
              <Link key={o.id} className="offercard" href={`/listings/${o.listingId}`} style={{ textDecoration: "none" }}>
                <div className="offershot">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={o.listing.photoUrls[0]} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
                <div className="offerbody">
                  <b>{o.listing.title}</b>
                  <span className="offermine">
                    you offered {formatCents(o.amountCents)} · asking {formatCents(o.listing.priceCents)}
                  </span>
                </div>
                <span className={`ostat ${o.status === "accepted" ? "accepted" : o.status === "pending" ? "leading" : ""}`}>{o.status}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty">no offers yet.</div>
        )}
      </div>

      {sold.length > 0 && (
        <div className="sect">
          <h2 className="sec-title">sold</h2>
          <div className="grid">
            {sold.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
