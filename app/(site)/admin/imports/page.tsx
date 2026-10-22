import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { isAdmin, recentRuns, reviewQueue } from "@/lib/importer/admin";
import { olderThan, STALE_PENDING_MS, STALE_RUN_MS } from "@/lib/importer/importer";
import { netidFromEmail } from "@/lib/importer/rules";
import { formatCents } from "@/lib/rules";
import { AutoRefresh } from "../../_components/AutoRefresh";
import { reviewAction } from "../actions";
import { ImportForms, InviteButton, SourceButton, ApproveAllButton } from "./ImportForms";

/* Listserv imports: run them, approve or reject each item before anyone sees
   it (the admin's approval is the consent to republish), and invite each
   sale's poster to claim it. */
type ImportSearch = Promise<{ notice?: string | string[] }>;

export default function ImportsPage({ searchParams }: { searchParams: ImportSearch }) {
  return (
    <div className="wf">
      <div className="wrap" style={{ paddingTop: 24 }}>
        <Suspense fallback={<p className="sub">loading…</p>}>
          <Imports searchParams={searchParams} />
        </Suspense>
        <div style={{ height: 70 }} />
      </div>
    </div>
  );
}

async function Imports({ searchParams }: { searchParams: ImportSearch }) {
  const params = await searchParams;
  const notice = typeof params.notice === "string" ? params.notice : null;
  const user = await requireUser("/admin/imports");
  if (!isAdmin(user.netid)) notFound();
  const [queue, runs] = await Promise.all([reviewQueue(), recentRuns()]);
  const engineConfigured = !!(process.env.INBOX_ENGINE_URL && process.env.INBOX_ENGINE_TOKEN);
  const waiting = queue.reduce((n, q) => n + q.items.length, 0);
  // reads and searches finish in the background; keep the page current until they're done
  const lastRun = runs[0];
  const runGoing = !!lastRun && !lastRun.finished_at && !olderThan(lastRun.started_at as string, STALE_RUN_MS);
  const reading = queue.some(({ source }) => source.status === "pending" && !olderThan(source.createdAt, STALE_PENDING_MS));
  return (
    <>
      {(runGoing || reading) && <AutoRefresh />}
      <h1 className="sec-title">listserv imports</h1>
      {notice && <p className="note" role="status">{notice}</p>}
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
          {String(lastRun.summary ?? (lastRun.finished_at ? "" : runGoing ? "still running…" : "cut off before it finished (the server restarted); run it again"))}
        </p>
      )}
      {[
        { title: "pending", entries: queue.filter(({ source, items }) => source.status !== "done" || items.length > 0) },
        { title: "reviewed", entries: queue.filter(({ source, items }) => source.status === "done" && items.length === 0) },
      ].map(({ title, entries }) => (
        <section key={title} aria-label={title}>
          <h2 className="sec-title" style={{ fontSize: 20, margin: "18px 0 10px" }}>{title} ({entries.length})</h2>
          {title === "pending" && <p className="sub">{waiting} items waiting for approval</p>}
          {entries.length === 0 && <p className="sub">{title === "pending" ? "nothing pending." : "nothing reviewed yet."}</p>}
          {entries.map(({ source, items }) => (
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
            {source.status === "done" ? (
              <SourceButton sourceId={source.id} decision="done" disabled={items.length > 0} />
            ) : source.status === "failed" ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="err">failed</span>
                <SourceButton sourceId={source.id} decision="retry" />
              </div>
            ) : (
              <span className="ostat">{!olderThan(source.createdAt, STALE_PENDING_MS) ? "reading…" : "cut off"}</span>
            )}
          </div>
          {source.error && <p className={source.status === "failed" ? "err" : "sub"}>{source.status === "failed" ? source.error : `skipped: ${source.error}`}</p>}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
            {/* everything from this seller's sale in one click, without scrolling past it */}
            {items.length > 1 && (
              <form action={reviewAction}>
                <input type="hidden" name="sourceId" value={source.id} />
                {items.map((it) => (
                  <input key={it.id} type="hidden" name="id" value={it.id} />
                ))}
                <ApproveAllButton>approve all {items.length} from {source.authorName ?? "this sale"}</ApproveAllButton>
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
                <input type="hidden" name="sourceId" value={source.id} />
                {items.map((it) => (
                  <input key={it.id} type="hidden" name="id" value={it.id} />
                ))}
                <ApproveAllButton outline>approve all {items.length}</ApproveAllButton>
                <button className="btn btn-ghost" name="decision" value="reject">
                  reject all
                </button>
              </form>
            </>
          )}
        </div>
          ))}
        </section>
      ))}
    </>
  );
}
