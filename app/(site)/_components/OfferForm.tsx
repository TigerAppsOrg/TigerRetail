"use client";
/* PRD #4: make (or update) an offer. One button opens a small panel with
   one-tap amounts (asking, −10%, −20%) or "other", plus an optional note. */
import { useActionState, useState } from "react";
import { formatCents, parseDollars } from "@/lib/rules";
import { makeOfferAction, type FormState } from "../actions";
import { Icon } from "./Icon";

/* whole dollars, never below $1 */
const off = (cents: number, pct: number) => Math.max(100, Math.round((cents * (1 - pct)) / 100) * 100);

export function OfferForm({ listingId, askingCents, label }: { listingId: string; askingCents: number; label: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(makeOfferAction, undefined);
  const [open, setOpen] = useState(false);
  const presets: [string, number][] = [
    ["asking", askingCents],
    ["−10%", off(askingCents, 0.1)],
    ["−20%", off(askingCents, 0.2)],
  ];
  const unique = presets.filter(([, c], i) => presets.findIndex(([, x]) => x === c) === i);
  const [pick, setPick] = useState<number | "other">(askingCents);
  const [other, setOther] = useState("");
  const cents = pick === "other" ? parseDollars(other) : pick;
  const e = state?.errors ?? {};
  const sent = state && !state.errors;

  // the panel stays open through errors and closes into this once the offer is in
  if (sent) {
    return (
      <p className="attr" role="status" style={{ margin: "6px 0 0" }}>
        offer sent. the seller sees it on this page.
      </p>
    );
  }
  if (!open) {
    return (
      <button className="btn btn-primary btn-block" style={{ marginTop: 6 }} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }
  return (
    <form action={action} className="sheet">
      <div className="sheet-head">
        <b>{label}</b>
        <button type="button" className="icon-plain" aria-label="close" onClick={() => setOpen(false)}>
          <Icon name="x" />
        </button>
      </div>
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="amount" value={cents !== null ? (cents / 100).toFixed(2) : other} />
      <div className="amts" role="radiogroup" aria-label="offer amount">
        {unique.map(([t, c]) => (
          <button key={t} type="button" role="radio" aria-checked={pick === c} className={pick === c ? "on" : ""} onClick={() => setPick(c)}>
            {formatCents(c)}
            <small>{t}</small>
          </button>
        ))}
        <button type="button" role="radio" aria-checked={pick === "other"} className={pick === "other" ? "on" : ""} onClick={() => setPick("other")}>
          other
        </button>
      </div>
      {pick === "other" && (
        <div className="bigamt" style={{ margin: 0 }}>
          <span>$</span>
          <input inputMode="decimal" aria-label="your offer ($)" autoFocus value={other} onChange={(ev) => setOther(ev.target.value)} />
        </div>
      )}
      {e.amount && <p className="err">{e.amount}</p>}
      <input className="inp" name="message" maxLength={500} aria-label="note to the seller" placeholder="add a note (optional) — e.g. can pick up tonight" />
      {e.form && <p className="err">{e.form}</p>}
      <button className="btn btn-primary btn-block" disabled={pending || cents === null}>
        {pending ? "sending…" : cents !== null ? `send ${formatCents(cents)} offer` : "enter an amount"}
      </button>
    </form>
  );
}
