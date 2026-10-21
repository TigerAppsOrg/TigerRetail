import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { canManage, isAdmin, saleListings, sourceFor } from "@/lib/importer/admin";
import { formatCents } from "@/lib/rules";
import { claimImportAction, publishOwnAction, takeDownImportAction } from "../../actions";
import { BuildingSelect } from "../../_components/ProfileForm";

/* A seller's sale page. Two ways in:
   - an invite to a sale we imported from the listserv: one CAS sign-in (no
     onboarding), add it to their account in one tap, take down anything;
   - their own deck, pasted on the sell page: check the drafts Claude read,
     take down what's wrong or sold, post the rest in one tap.
   An admin who opens it sees the same page as a preview, buttons off. */
export default function WelcomePage({ params }: PageProps<"/welcome/[id]">) {
  return (
    <div className="wf">
      <div className="wrap" style={{ paddingTop: 24 }}>
        <Suspense fallback={<p className="sub">loading…</p>}>
          <Welcome params={params} />
        </Suspense>
        <div style={{ height: 70 }} />
      </div>
    </div>
  );
}

const STATUS: Record<string, string> = { review: "being checked", active: "live", sold: "sold" };
const OWN_STATUS: Record<string, string> = { review: "draft", active: "posted", sold: "sold" };

async function Welcome({ params }: { params: PageProps<"/welcome/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser(`/welcome/${id}`, { onboarded: false });
  const source = await sourceFor(id);
  if (!source) notFound();
  const mine = canManage(source, user.netid);
  const own = !!source.submittedBy; // pasted on the sell page, not found on the listserv
  const preview = !mine && isAdmin(user.netid);
  if (!mine && !preview) {
    return (
      <div className="empty" style={{ maxWidth: 560 }}>
        this sale was posted by someone else. if it&rsquo;s yours, sign in with the netid you sent it from.
      </div>
    );
  }
  const items = await saleListings(id, mine ? user.netid : "");
  const waiting = items.filter((i) => !i.claimed);
  const drafts = items.filter((i) => i.claimed && i.status === "review");
  const first = (mine ? user.displayName || source.authorName : source.authorName)?.trim().split(/\s+/)[0];
  const sale = source.subject || "your sale";
  const off = preview ? { disabled: true, title: "preview: only the seller can do this" } : {};

  return (
    <div className="acct" style={{ maxWidth: 980 }}>
      {preview && (
        <div className="note" role="status">
          preview: this is what {source.authorName ?? source.authorEmail} sees after signing in. the buttons only work for them.
        </div>
      )}
      {own ? (
        <div>
          <h1 className="sec-title">your slides, ready to post</h1>
          <p className="sub" style={{ marginTop: 6, maxWidth: 640 }}>
            claude read {items.length === 1 ? "1 item" : `${items.length} items`} from your deck
            {source.error ? ` (skipped: ${source.error})` : ""}. take down anything that&rsquo;s wrong or
            already sold, then post the rest. tap an item to see its listing.
          </p>
        </div>
      ) : (
        <div>
          <h1 className="sec-title">welcome to TigerRetail{first ? `, ${first.toLowerCase()}` : ""}</h1>
          <p className="sub" style={{ marginTop: 6, maxWidth: 640 }}>
            we saw your sale on the listserv, &ldquo;{sale}&rdquo;, and put {items.length === 1 ? "its item" : `its ${items.length} items`} here with the photos,
            prices and contact details from your post. take down anything that&rsquo;s sold or that you&rsquo;d rather not list.
          </p>
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty">nothing from this sale is listed anymore.</div>
      ) : own ? (
        drafts.length > 0 ? (
          <form action={publishOwnAction} className="blk" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <input type="hidden" name="sourceId" value={source.id} />
            <span>
              <b>post {drafts.length === 1 ? "it" : `all ${drafts.length}`}</b>
              <br />
              <span className="sub" style={{ margin: 0 }}>
                they go live with your profile&rsquo;s contact details and payment methods.
              </span>
            </span>
            <button className="btn btn-primary" {...off}>
              post {drafts.length === 1 ? "it" : `all ${drafts.length}`}
            </button>
          </form>
        ) : (
          <div className="note" role="status">
            posted. you&rsquo;ll find them in <Link href="/me">my stuff</Link>.
          </div>
        )
      ) : waiting.length > 0 ? (
        <form action={claimImportAction} className="blk" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <input type="hidden" name="sourceId" value={source.id} />
          <input type="hidden" name="back" value={`/welcome/${source.id}`} />
          <span style={{ flex: "1 1 280px" }}>
            <b>add {waiting.length === 1 ? "it" : `all ${waiting.length}`} to your account</b>
            <br />
            <span className="sub" style={{ margin: 0 }}>
              buyers can then message you here, and they show up in your stuff. your dorm puts them on the map.
            </span>
          </span>
          <div style={{ flex: "1 1 260px" }}>
            <BuildingSelect defaultValue={(mine && user.building) || source.building || ""} />
          </div>
          <button className="btn btn-primary" {...off}>
            add {waiting.length === 1 ? "it" : "them"} to my account
          </button>
        </form>
      ) : (
        <div className="note" role="status">
          they&rsquo;re yours. buyers can message you here; you&rsquo;ll find them in <Link href="/me">my stuff</Link>.
        </div>
      )}

      {items.length > 0 && (
        <div className="grid">
          {items.map((it) => (
            <div key={it.id} className="card" style={{ cursor: "default" }}>
              <Link href={`/listings/${it.id}`} className="ph" style={{ display: "block" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- photos are already downscaled on import */}
                <img src={it.photoUrls[0]} alt="" loading="lazy" />
                <span className="ph-badge chip">{(own ? OWN_STATUS : STATUS)[it.status] ?? it.status}</span>
              </Link>
              <div className="card-text">
                <div className="card-name">
                  <b>{it.title}</b>
                  <span>{formatCents(it.priceCents)}</span>
                </div>
                <div className="card-meta">{[it.size !== "n/a" ? it.size : null, it.brand || null].filter(Boolean).join(" · ")}</div>
              </div>
              <form action={takeDownImportAction} style={{ display: "flex", gap: 6 }}>
                <input type="hidden" name="sourceId" value={source.id} />
                <input type="hidden" name="id" value={it.id} />
                {it.claimed && !preview && (
                  <Link className="btn btn-outline" href={`/listings/${it.id}/edit`} style={{ padding: "6px 14px", flex: 1, textAlign: "center" }}>
                    edit
                  </Link>
                )}
                <button className="btn btn-outline" style={{ padding: "6px 14px", flex: 1 }} {...off}>
                  take down
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      {items.length > 1 && (
        <form action={takeDownImportAction}>
          <input type="hidden" name="sourceId" value={source.id} />
          {items.map((it) => (
            <input key={it.id} type="hidden" name="id" value={it.id} />
          ))}
          <button className="btn btn-ghost" {...off}>
            take everything down
          </button>
        </form>
      )}
    </div>
  );
}
