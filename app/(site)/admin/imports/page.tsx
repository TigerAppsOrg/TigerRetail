import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { isAdmin, recentRuns, reviewQueue } from "@/lib/importer/admin";
import { netidFromEmail } from "@/lib/importer/rules";
import { formatCents } from "@/lib/rules";
import { reviewAction } from "../actions";
import { ImportForms, InviteButton } from "./ImportForms";

/* Listserv imports: run them, approve or reject each item before anyone sees
   it (the admin's approval is the consent to republish), and invite each
   sale's poster to claim it. */
export default function ImportsPage() {
  return (
    <div className="wf">
      <div className="wrap" style={{ paddingTop: 24 }}>
        <Suspense fallback={<p className="sub">loading…</p>}>
          <Imports />
        </Suspense>
        <div style={{ height: 70 }} />
      </div>
    </div>
  );
}

async function Imports() {
  const user = await requireUser("/admin/imports");
  if (!isAdmin(user.netid)) notFound();
  const [queue, runs] = await Promise.all([reviewQueue(), recentRuns()]);
  const engineConfigured = !!(process.env.INBOX_ENGINE_URL && process.env.INBOX_ENGINE_TOKEN);
  const waiting = queue.reduce((n, q) => n + q.items.length, 0);
  return (
    <>
      <h1 className="sec-title">listserv imports</h1>
      <p className="sub" style={{ marginTop: 4 }}>
        items from sale decks, and from sales written in an email with photos, wait here until you approve them. approving one publishes it with the
        contact details from the seller&rsquo;s own post (only signed-in users see those). send the seller an invite to claim their sale; while
        testing, invites go to {process.env.INVITE_TEST_RECIPIENT || "nobody (INVITE_TEST_RECIPIENT isn't set)"}.
      </p>
      {!process.env.ANTHROPIC_API_KEY && <p className="errbox">ANTHROPIC_API_KEY isn&rsquo;t set, so decks can&rsquo;t be read yet.</p>}
      <div style={{ margin: "18px 0 28px" }}>
        <ImportForms engineConfigured={engineConfigured} />
      </div>
      {runs.length > 0 && (
        <p className="sub">
          last run {new Date(runs[0].started_at as string).toLocaleString("en-US", { timeZone: "America/New_York" }).toLowerCase()}:{" "}
          {String(runs[0].summary ?? (runs[0].finished_at ? "" : "still running"))}
        </p>
      )}
      <h2 className="sec-title" style={{ fontSize: 20, margin: "18px 0 10px" }}>
        waiting for review ({waiting})
      </h2>
      {queue.length === 0 && <div className="empty">nothing imported yet.</div>}
      {queue.map(({ source, items }) => (
        <div key={source.id} className="sect review-deck">
          <div className="sec-head">
            <div>
              <b>{source.subject || "pasted deck"}</b>{" "}
              <span className="muted">
                {source.authorName ? `· ${source.authorName} ` : ""}
                {source.listserv ? `· ${source.listserv.toLowerCase()} ` : ""}
                {source.originalUrl && (
                  <>
                    ·{" "}
                    <a className="crumb-link" href={source.originalUrl} target="_blank" rel="noreferrer">
                      {source.kind === "email" ? "original email" : "original slides"}
                    </a>
                  </>
                )}
              </span>
            </div>
            <span className={`ostat ${source.status === "done" ? "accepted" : ""}`}>{source.status}</span>
          </div>
          {source.error && <p className={source.status === "failed" ? "err" : "sub"}>{source.status === "failed" ? source.error : `skipped: ${source.error}`}</p>}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
            {/* everything from this seller's sale in one click, without scrolling past it */}
            {items.length > 1 && (
              <form action={reviewAction}>
                {items.map((it) => (
                  <input key={it.id} type="hidden" name="id" value={it.id} />
                ))}
                <button className="btn btn-primary" name="decision" value="approve" style={{ padding: "6px 14px" }}>
                  approve all {items.length} from {source.authorName ?? "this sale"}
                </button>
              </form>
            )}
            {source.status === "done" && netidFromEmail(source.authorEmail) && (
              <InviteButton
                sourceId={source.id}
                invited={
                  source.invitedAt
                    ? `invited ${new Date(source.invitedAt).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).toLowerCase()} → ${source.invitedTo}`
                    : null
                }
              />
            )}
          </div>
          {items.length > 0 && (
            <>
              <div className="grid" style={{ marginTop: 10 }}>
                {items.map((it) => (
                  <div key={it.id} className="card" style={{ cursor: "default" }}>
                    {/* opens the listing exactly as it will be posted (admins can see it before approving) */}
                    <Link href={`/listings/${it.id}`} title="see the full listing" style={{ color: "inherit", textDecoration: "none" }}>
                      <div className="ph">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={it.photoUrl} alt="" />
                        <span className="ph-badge chip chip-sold">
                          {source.kind === "email" ? "item" : "slide"} {it.slide}
                        </span>
                      </div>
                      <div className="card-text">
                        <div className="card-name">
                          <b>{it.title}</b>
                          <span>{formatCents(it.priceCents)}</span>
                        </div>
                        <div className="card-meta">
                          {it.sub} · {it.size} · {it.condition}
                        </div>
                        {it.description && <div className="card-meta">{it.description}</div>}
                      </div>
                    </Link>
                    <form action={reviewAction} style={{ display: "flex", gap: 6 }}>
                      <input type="hidden" name="id" value={it.id} />
                      <button className="btn btn-primary" name="decision" value="approve" style={{ padding: "6px 14px", flex: 1 }}>
                        approve
                      </button>
                      <button className="btn btn-outline" name="decision" value="reject" style={{ padding: "6px 14px", flex: 1 }}>
                        reject
                      </button>
                    </form>
                  </div>
                ))}
              </div>
              <form action={reviewAction} style={{ display: "flex", gap: 10, marginTop: 12 }}>
                {items.map((it) => (
                  <input key={it.id} type="hidden" name="id" value={it.id} />
                ))}
                <button className="btn btn-outline" name="decision" value="approve">
                  approve all {items.length}
                </button>
                <button className="btn btn-ghost" name="decision" value="reject">
                  reject all
                </button>
              </form>
            </>
          )}
        </div>
      ))}
    </>
  );
}
