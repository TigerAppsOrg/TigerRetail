import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { conversationFor } from "@/lib/data";
import { formatCents, personLabel } from "@/lib/rules";
import { Avatar } from "../../_components/Avatar";
import { PersonLink } from "../../_components/PersonLink";
import { Icon } from "../../_components/Icon";
import { Thread } from "./Thread";

export default function ConversationPage({ params }: PageProps<"/messages/[id]">) {
  return (
    <div className="wf">
      <div className="wrap" style={{ paddingTop: 18 }}>
        <Suspense fallback={<p className="sub">loading…</p>}>
          <Conversation params={params} />
        </Suspense>
      </div>
    </div>
  );
}

async function Conversation({ params }: { params: PageProps<"/messages/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser(`/messages/${id}`);
  const view = await conversationFor(id, user.netid);
  if (!view) notFound();
  const { listing, other, messages, conversation } = view;
  const iAmSeller = conversation.sellerNetid === user.netid;
  return (
    <div className="convo">
      <div className="convo-head">
        <Link className="tool" href="/messages">
          <Icon name="back" /> messages
        </Link>
        <span className="person">
          <PersonLink netid={other.netid}>
            <Avatar person={other} size={34} />
            <b>{personLabel(other)}</b>
          </PersonLink>
          {listing && <span className="muted">{iAmSeller ? "· buyer" : "· seller"}</span>}
        </span>
        {listing && <Link className="convo-item" href={`/listings/${listing.id}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={listing.photoUrl} alt="" />
          <span>
            <b>{listing.title}</b>
            <span className="muted">
              {formatCents(listing.priceCents)}
              {listing.status === "sold" ? " · sold" : ""}
            </span>
          </span>
        </Link>}
      </div>
      <Thread conversationId={conversation.id} me={user.netid} other={other} initial={messages} />
    </div>
  );
}
