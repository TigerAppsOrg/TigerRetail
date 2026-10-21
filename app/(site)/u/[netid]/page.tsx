import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getViewer } from "@/lib/auth";
import { publicProfile } from "@/lib/data";
import { personLabel } from "@/lib/rules";
import { Avatar } from "../../_components/Avatar";
import { ListingCard } from "../../_components/ListingCard";

/* Someone's public page: who they are and what they're selling. Contact
   details stay private (they come with an accepted offer). */
export default function PersonPage({ params }: PageProps<"/u/[netid]">) {
  return (
    <div className="wf">
      <div className="wrap" style={{ paddingTop: 24 }}>
        <Suspense fallback={<p className="sub">loading…</p>}>
          <Person params={params} />
        </Suspense>
        <div style={{ height: 70 }} />
      </div>
    </div>
  );
}

async function Person({ params }: { params: PageProps<"/u/[netid]">["params"] }) {
  const netid = decodeURIComponent((await params).netid).toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(netid)) notFound();
  const [p, viewer] = await Promise.all([publicProfile(netid), getViewer()]);
  if (!p) notFound();
  const you = viewer?.netid === netid;
  return (
    <>
      <div className="sect" style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
        <Avatar person={p.person} size={84} />
        <div style={{ flex: "1 1 260px" }}>
          <h1 className="sec-title" style={{ margin: 0 }}>
            {personLabel(p.person)}
          </h1>
          <p className="sub" style={{ margin: "4px 0 0" }}>
            {[p.person.displayName ? p.person.netid : null, p.building ? `lives in ${p.building}` : null].filter(Boolean).join(" · ")}
          </p>
          {p.bio && (
            <p className="desc" style={{ margin: "8px 0 0" }}>
              {p.bio}
            </p>
          )}
        </div>
        {you && (
          <Link className="link-act" href="/profile">
            edit your profile
          </Link>
        )}
      </div>
      <div className="sect">
        <h2 className="sec-title" style={{ fontSize: 20 }}>
          {you ? "what you have up" : "what they're selling"} ({p.listings.length})
        </h2>
        {p.listings.length ? (
          <div className="grid" style={{ marginTop: 10 }}>
            {p.listings.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <div className="empty">nothing listed right now.</div>
        )}
      </div>
    </>
  );
}
