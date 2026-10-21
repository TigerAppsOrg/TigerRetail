import { paymentLabel, type Payment } from "@/lib/catalog";
import type { Person } from "@/lib/data";
import { formatPhone, personLabel } from "@/lib/rules";
import { Avatar } from "./Avatar";
import { PersonLink } from "./PersonLink";

/* Revealed only after an accepted offer: the seller's listing contact to the
   buyer, or the buyer's account contact to the seller. */
export function Contact({
  role,
  person,
  email,
  phone,
  payments,
  pickup,
  link = true,
}: {
  role: "seller" | "buyer";
  link?: boolean; // name and photo go to their page (not for a listserv poster who hasn't joined)
  person: Person;
  email: string;
  phone: string | null;
  payments: Payment[];
  pickup?: string;
}) {
  return (
    <div className="contactcard">
      {(() => {
        const who = (
          <>
            <Avatar person={person} size={34} />
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
              <b>
                {role}: {personLabel(person)}
              </b>
              {person.displayName && <span className="muted" style={{ fontSize: 12.5 }}>{person.netid}</span>}
            </span>
          </>
        );
        return link ? (
          <PersonLink netid={person.netid}>
            <span className="person" style={{ alignItems: "flex-start" }}>{who}</span>
          </PersonLink>
        ) : (
          <span className="person" style={{ alignItems: "flex-start" }}>{who}</span>
        );
      })()}
      <span>
        email: <a href={`mailto:${email}`}>{email}</a>
      </span>
      {phone && (
        <span>
          text: <a href={`sms:${phone}`}>{formatPhone(phone)}</a>
        </span>
      )}
      <span>
        {role === "seller" ? "takes" : "pays with"}: {payments.map(paymentLabel).join(" · ")}
      </span>
      {pickup && <span>pickup: {pickup}</span>}
    </div>
  );
}
