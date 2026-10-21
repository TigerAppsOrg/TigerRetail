import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getViewer } from "@/lib/auth";
import {
  canEditListing,
  getListing,
  getUser,
  listingContact,
  listingsBySeller,
  offersOnListing,
  people,
  type Listing,
  type Offer,
  type Person,
  type User,
} from "@/lib/data";
import {
  buyerSeesSellerContact,
  formatCents,
  offerBlocker,
  personLabel,
} from "@/lib/rules";
import { Avatar } from "../../_components/Avatar";
import { PersonLink } from "../../_components/PersonLink";
import {
  canClaim,
  isAdmin,
  sourceFor,
  type ImportSource,
} from "@/lib/importer/admin";
import { IMPORT_ACCOUNT, netidFromEmail } from "@/lib/importer/rules";
import {
  markSoldAction,
  respondToOfferAction,
  startConversationAction,
} from "../../actions";
import { reviewAction } from "../../admin/actions";
import { Contact } from "../../_components/Contact";
import { Gallery } from "../../_components/Gallery";
import { Icon } from "../../_components/Icon";
import { ListingCard } from "../../_components/ListingCard";
import { OfferForm } from "../../_components/OfferForm";

/* Wireframe V.item. Offers and the contact reveal are ours: the wireframe
   did them in a modal; here they sit on the page. */
export default function ListingPage({
  params,
  searchParams,
}: PageProps<"/listings/[id]">) {
  return (
    <div className="wf">
      <div className="wrap">
        <Suspense fallback={<p className="sub">loading listing…</p>}>
          <ListingView params={params} searchParams={searchParams} />
        </Suspense>
        <div style={{ height: 70 }} />
      </div>
    </div>
  );
}

async function ListingView({
  params,
  searchParams,
}: Pick<PageProps<"/listings/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const { posted } = await searchParams;
  const [l, viewer] = await Promise.all([getListing(id), getViewer()]);
  if (!l) notFound();
  // imported items waiting for review exist only for admins
  // (and a seller's own drafts, from a deck they pasted, only for them)
  if (l.status === "review" && !isAdmin(viewer?.netid) && viewer?.netid !== l.sellerNetid) notFound();
  const unclaimed = l.sellerNetid === IMPORT_ACCOUNT;
  const source = await sourceFor(l.importSourceId);
  const [offers, sellerItems] = await Promise.all([
    offersOnListing(l.id),
    listingsBySeller(l.sellerNetid),
  ]);
  const isSeller = viewer?.netid === l.sellerNetid;
  const who = await people([l.sellerNetid, ...offers.map((o) => o.buyerNetid)]);
  const seller: Person = who.get(l.sellerNetid) ?? {
    netid: l.sellerNetid,
    displayName: null,
    avatarUrl: null,
  };
  const top = offers.length
    ? Math.max(...offers.map((o) => o.amountCents))
    : null;
  // for an unclaimed import, "the seller" is the sale deck it came from
  const more = sellerItems
    .filter(
      (x) =>
        x.status === "active" &&
        x.id !== l.id &&
        (!unclaimed || x.importSourceId === l.importSourceId),
    )
    .slice(0, 2);
  const cat = `/browse?cat=${encodeURIComponent(l.section)}`;

  return (
    <>
      <div className="crumbbar">
        <div className="crumb">
          <Link className="crumb-link" href={cat}>
            {l.section}
          </Link>{" "}
          /{" "}
          <Link
            className="crumb-link"
            href={`${cat}&sub=${encodeURIComponent(l.sub)}`}
          >
            {l.sub}
          </Link>{" "}
          / <b>{l.title}</b>
        </div>
        <Link className="tool" href={cat}>
          <Icon name="back" /> back
        </Link>
      </div>
      {l.status === "review" && isSeller && l.importSourceId && (
        <div className="note">
          draft from your slides: only you can see it.{" "}
          <Link href={`/welcome/${l.importSourceId}`}>back to your slides to post it</Link>
        </div>
      )}
      {posted && isSeller && (
        <div className="note">
          posted. <Link href="/sell">list another item</Link>
        </div>
      )}
      <div className="detail">
        <div className="detail-main">
          <Gallery urls={l.photoUrls} alt={l.title} />
          <div className="detail-info">
            <h1>{l.title}</h1>
            <div
              className="row"
              style={{ display: "flex", gap: 10, alignItems: "center" }}
            >
              <div className="price">{formatCents(l.priceCents)}</div>
              {l.status === "sold" && (
                <span className="chip chip-sold">sold</span>
              )}
            </div>
            {l.tryOn ? (
              <div className="tryrow">
                <span className="dot" /> try-ons allowed · size {l.size}
              </div>
            ) : (
              <div className="tryrow" style={{ color: "var(--muted)" }}>
                {/* an imported post that didn't mention try-ons didn't say no */}
                {APPAREL_SECTIONS.has(l.section) && !l.contactPublic ? "no try-ons · " : ""}size{" "}
                {l.size}
              </div>
            )}
            <div className="attr">
              {[
                l.brand || null,
                `condition ${l.condition}`,
                l.occasion !== "none" ? l.occasion : null,
                l.dept !== "misc" ? l.dept : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
            {l.description && <p className="desc">{l.description}</p>}
            {/* the seller's own instructions for the sale, from their post */}
            {viewer && source && source.sellerNotes.length > 0 && (
              <div>
                <div className="attr" style={{ marginBottom: 5 }}>
                  from the seller&rsquo;s post
                </div>
                <ul className="desc" style={{ margin: 0, paddingLeft: 18 }}>
                  {source.sellerNotes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
            {l.accepts.length > 0 && (
              <div>
                <div className="attr" style={{ marginBottom: 5 }}>
                  accepts
                </div>
                <div className="paytags">
                  {l.accepts.map((p) => (
                    <span key={p} className="paytag">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {/* offers stay between buyer and seller: only the seller sees how many and the highest */}
            {unclaimed && source ? (
              <ImportedPanel listing={l} source={source} viewer={viewer} />
            ) : isSeller ? (
              <a
                className="btn btn-outline btn-block"
                href="#offers"
                style={{ marginTop: 6 }}
              >
                your listing &mdash; {offers.length} offer
                {offers.length === 1 ? "" : "s"}
                {top !== null ? ` · highest ${formatCents(top)}` : ""}
              </a>
            ) : (
              <BuyerPanel
                listing={l}
                offers={offers}
                viewer={viewer}
                seller={seller}
              />
            )}
            {canEditListing(l, viewer?.netid, isAdmin(viewer?.netid)) && (
              <Link className="btn btn-outline btn-block" href={`/listings/${l.id}/edit`}>
                edit listing
              </Link>
            )}
            {unclaimed ? (
              <p className="attr" style={{ margin: 0 }}>
                from {source?.authorName ? `${source.authorName}'s` : "a"} sale
                {source?.listserv ? ` on ${source.listserv.toLowerCase()}` : ""}
                {source?.sentAt
                  ? `, ${new Date(source.sentAt).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }).toLowerCase()}`
                  : ""}
              </p>
            ) : (
              <p className="attr" style={{ margin: 0 }}>
                posted by{" "}
                <PersonLink netid={seller.netid}>
                  <Avatar person={seller} size={22} />{" "}
                  {isSeller ? "you" : personLabel(seller)}
                </PersonLink>{" "}
                on{" "}
                {new Date(l.createdAt)
                  .toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                  .toLowerCase()}
              </p>
            )}
          </div>
        </div>
        <div className="rail">
          <h3>{unclaimed ? "more from this sale" : "more from this seller"}</h3>
          {more.length ? (
            <div className="grid">
              {more.map((x) => (
                <ListingCard key={x.id} listing={x} />
              ))}
            </div>
          ) : (
            <div className="empty" style={{ padding: 22 }}>
              nothing else listed right now.
            </div>
          )}
        </div>
      </div>
      {isSeller && <SellerPanel listing={l} offers={offers} who={who} />}
    </>
  );
}

const APPAREL_SECTIONS = new Set(["clothing", "special occasions"]);

async function BuyerPanel({
  listing,
  offers,
  viewer,
  seller,
}: {
  listing: Listing;
  offers: Offer[];
  viewer: User | null;
  seller: Person;
}) {
  if (!viewer) {
    return (
      <Link
        className="btn btn-primary btn-block"
        href={`/login?next=${encodeURIComponent(`/listings/${listing.id}`)}`}
        style={{ marginTop: 6 }}
      >
        sign in to make an offer or message the seller
      </Link>
    );
  }
  const mine = offers.find((o) => o.buyerNetid === viewer.netid);
  if (
    mine?.status === "accepted" &&
    buyerSeesSellerContact(viewer.netid, offers)
  ) {
    const c = await listingContact(listing.id);
    const pickup = [c.pickupBuilding, c.roomDirections, c.pickup]
      .filter(Boolean)
      .join(" · ");
    return (
      <>
        <div className="note" style={{ margin: "6px 0 0" }}>
          {personLabel(seller)} accepted your {formatCents(mine.amountCents)}{" "}
          offer. reach out to set up pickup.
        </div>
        <Contact
          role="seller"
          person={seller}
          email={c.email}
          phone={c.phone}
          payments={c.payments}
          pickup={pickup}
        />
        <MessageButton
          listingId={listing.id}
          label={`message ${seller.displayName || seller.netid}`}
        />
      </>
    );
  }
  const blocked = offerBlocker(listing, viewer.netid);
  // an imported sale's contact details were public in the seller's own post
  const posted = listing.contactPublic ? await listingContact(listing.id) : null;
  return (
    <>
      {posted && (
        <Contact
          role="seller"
          person={seller}
          email={posted.email}
          phone={posted.phone}
          payments={posted.payments}
          pickup={[posted.pickupBuilding, posted.roomDirections, posted.pickup].filter(Boolean).join(" · ")}
        />
      )}
      {mine && (
        <p className="offermine" style={{ margin: "6px 0 0" }}>
          your offer: <b>{formatCents(mine.amountCents)}</b>{" "}
          <span
            className={`ostat ${mine.status === "pending" ? "leading" : ""}`}
          >
            {mine.status}
          </span>
        </p>
      )}
      {blocked ? (
        <p className="attr">{blocked}</p>
      ) : (
        <OfferForm
          listingId={listing.id}
          askingCents={listing.priceCents}
          label={mine ? "update your offer" : "make an offer"}
        />
      )}
      {listing.status === "active" && (
        <MessageButton listingId={listing.id} label="message seller" />
      )}
    </>
  );
}

async function SellerPanel({
  listing,
  offers,
  who,
}: {
  listing: Listing;
  offers: Offer[];
  who: Map<string, Person>;
}) {
  const accepted = offers.filter((o) => o.status === "accepted");
  const buyers = await Promise.all(accepted.map((o) => getUser(o.buyerNetid)));
  return (
    <div className="offers" id="offers">
      <h3 className="sec-title" style={{ fontSize: 19, marginBottom: 14 }}>
        offers ({offers.length})
      </h3>
      {offers.length === 0 ? (
        <div className="empty" style={{ padding: 22 }}>
          no offers yet.
        </div>
      ) : (
        <div className="offerlist">
          {offers.map((o) => (
            <div key={o.id} className="offrow">
              <b>{formatCents(o.amountCents)}</b>
              <span className="person">
                from{" "}
                <PersonLink netid={o.buyerNetid}>
                  <Avatar
                    person={who.get(o.buyerNetid) ?? { netid: o.buyerNetid }}
                    size={22}
                  />{" "}
                  {personLabel(who.get(o.buyerNetid) ?? { netid: o.buyerNetid })}
                </PersonLink>
              </span>
              {o.message && <small>&ldquo;{o.message}&rdquo;</small>}
              <span
                className={`ostat ${o.status === "accepted" ? "accepted" : ""}`}
                style={{ marginLeft: "auto" }}
              >
                {o.status}
              </span>
              <form action={startConversationAction}>
                <input type="hidden" name="listingId" value={listing.id} />
                <input type="hidden" name="buyer" value={o.buyerNetid} />
                <button
                  className="btn btn-outline"
                  style={{ padding: "7px 14px" }}
                  aria-label={`message ${o.buyerNetid}`}
                >
                  <Icon name="chat" /> message
                </button>
              </form>
              {o.status === "pending" && listing.status === "active" && (
                <form
                  action={respondToOfferAction}
                  style={{ display: "flex", gap: 8 }}
                >
                  <input type="hidden" name="offerId" value={o.id} />
                  <button
                    className="btn btn-primary"
                    name="decision"
                    value="accept"
                    style={{ padding: "7px 18px" }}
                  >
                    accept
                  </button>
                  <button
                    className="btn btn-outline"
                    name="decision"
                    value="decline"
                    style={{ padding: "7px 18px" }}
                  >
                    decline
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
      {buyers.map(
        (b) =>
          b && (
            <Contact
              key={b.netid}
              role="buyer"
              person={b}
              email={b.email}
              phone={b.phone}
              payments={b.payments}
            />
          ),
      )}
      {listing.status === "active" && (
        <form action={markSoldAction} style={{ marginTop: 16 }}>
          <input type="hidden" name="listingId" value={listing.id} />
          <button className="btn btn-outline">mark as sold</button>
        </form>
      )}
    </div>
  );
}

/* "message seller": opens (or reopens) the conversation about this item */
function MessageButton({
  listingId,
  label,
}: {
  listingId: string;
  label: string;
}) {
  return (
    <form action={startConversationAction}>
      <input type="hidden" name="listingId" value={listingId} />
      <button className="btn btn-outline btn-block" style={{ marginTop: 2 }}>
        <Icon name="chat" /> {label}
      </button>
    </form>
  );
}

/* An item imported from a listserv sale (slides, or the email itself): credit
   the poster, show signed-in buyers how the post says to reach them, and send
   the poster to their sale's welcome page to claim it. */
async function ImportedPanel({
  listing,
  source,
  viewer,
}: {
  listing: Listing;
  source: ImportSource;
  viewer: User | null;
}) {
  const mine = canClaim(source, viewer?.netid);
  const poster: Person = {
    netid: netidFromEmail(source.authorEmail) ?? "the seller",
    displayName: source.authorName,
    avatarUrl: null,
  };
  const c = viewer && listing.contactPublic ? await listingContact(listing.id) : null;
  return (
    <div className="fromlist">
      {listing.status === "review" && (
        <>
          <span>
            <b>waiting for review</b> &mdash; only admins can see this. it&rsquo;s exactly what buyers will see once approved.
          </span>
          <form action={reviewAction} style={{ display: "flex", gap: 8 }}>
            <input type="hidden" name="id" value={listing.id} />
            <input type="hidden" name="back" value="queue" />
            <button className="btn btn-primary" name="decision" value="approve" style={{ flex: 1 }}>
              approve
            </button>
            <button className="btn btn-outline" name="decision" value="reject" style={{ flex: 1 }}>
              reject
            </button>
          </form>
        </>
      )}
      <span>
        this came from a sale posted to the listserv
        {source.authorName ? ` by ${source.authorName}` : ""}. they
        haven&rsquo;t joined yet{c ? ", so here's how their post says to reach them" : ""}.
      </span>
      {c ? (
        <Contact
          role="seller"
          link={false} // they haven't joined: no page to go to yet
          person={poster}
          email={c.email}
          phone={c.phone}
          payments={c.payments}
          pickup={c.pickup}
        />
      ) : (
        !viewer && (
          <Link
            className="btn btn-primary btn-block"
            href={`/login?next=${encodeURIComponent(`/listings/${listing.id}`)}`}
          >
            sign in to see how to reach them
          </Link>
        )
      )}
      {source.originalUrl && (
        <a
          className="btn btn-outline btn-block"
          href={source.originalUrl}
          target="_blank"
          rel="noreferrer"
        >
          {source.kind === "email" ? "see the original email" : "see the original slides"}
        </a>
      )}
      {mine && (
        <Link className="btn btn-primary btn-block" href={`/welcome/${source.id}`}>
          this is my sale &mdash; manage these listings
        </Link>
      )}
    </div>
  );
}
