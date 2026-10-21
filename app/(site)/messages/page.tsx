import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { inbox } from "@/lib/data";
import { ago } from "@/lib/messaging";
import { personLabel } from "@/lib/rules";
import { Avatar } from "../_components/Avatar";

/* Inbox: every conversation you're in, newest first, unread on top visually. */
export default function MessagesPage() {
  return (
    <div className="wf">
      <div className="wrap" style={{ paddingTop: 24 }}>
        <h1 className="sec-title">messages</h1>
        <p className="sub" style={{ marginTop: 4 }}>
          questions and pickup plans, one conversation per item.
        </p>
        <Suspense fallback={<p className="sub">loading…</p>}>
          <Inbox />
        </Suspense>
        <div style={{ height: 70 }} />
      </div>
    </div>
  );
}

async function Inbox() {
  const user = await requireUser("/messages");
  const rows = await inbox(user.netid);
  await connection(); // "5m ago" depends on the clock: request time only
  const now = new Date();
  if (!rows.length) {
    return (
      <div className="empty" style={{ marginTop: 18 }}>
        no messages yet. open any listing and tap <b>message seller</b> to ask a question.
      </div>
    );
  }
  return (
    <div className="inbox">
      {rows.map((r) => (
        <Link key={r.id} href={`/messages/${r.id}`} className={`inbox-row ${r.unread ? "unread" : ""}`}>
          <Avatar person={r.other} size={44} />
          <div className="inbox-mid">
            <div className="inbox-top">
              <b>{personLabel(r.other)}</b>
              <span className="muted">· {r.listing.title}</span>
            </div>
            <div className="inbox-last">
              {r.lastFromMe ? "you: " : ""}
              {r.lastMessage}
            </div>
          </div>
          <div className="inbox-right">
            {r.lastMessageAt && <span className="muted">{ago(r.lastMessageAt, now)}</span>}
            {r.unread && <span className="dot" aria-label="unread" />}
          </div>
          <span className="inbox-thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.listing.photoUrl} alt="" />
          </span>
        </Link>
      ))}
    </div>
  );
}
