import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { searchRecipients } from "@/lib/directMessages";
import { personLabel } from "@/lib/rules";
import { Avatar } from "../../_components/Avatar";
import { RecipientButton } from "./RecipientButton";

type Search = Promise<{ q?: string | string[] }>;
export default function NewMessagePage({ searchParams }: { searchParams: Search }) {
  return <div className="wf"><div className="wrap" style={{ paddingTop: 24 }}>
    <Link className="crumb-link" href="/messages">← messages</Link>
    <h1 className="sec-title" style={{ marginTop: 16 }}>new message</h1>
    <p className="sub">find a registered person by name or netid.</p>
    <Suspense fallback={<p className="sub">loading…</p>}><Recipients searchParams={searchParams} /></Suspense>
  </div></div>;
}
async function Recipients({ searchParams }: { searchParams: Search }) {
  const user = await requireUser("/messages/new");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const people = await searchRecipients(user.netid, q);
  return <>
    <form action="/messages/new" style={{ display: "flex", gap: 10, maxWidth: 650, marginBottom: 24 }}>
      <input key={q} className="inp" name="q" defaultValue={q} placeholder="name or netid" aria-label="name or netid" maxLength={80} required />
      <button className="btn btn-outline">search</button>
    </form>
    {q.trim() && people.length === 0 && <p className="sub">no registered people found. try their netid.</p>}
    <div className="inbox">
      {people.map(person => <div className="inbox-row" key={person.netid}>
        <Avatar person={person} size={44} />
        <div className="inbox-mid"><b>{personLabel(person)}</b><div className="muted">{person.netid}</div></div>
        <RecipientButton netid={person.netid} />
      </div>)}
    </div>
  </>;
}
