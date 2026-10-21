"use client";
import { useActionState } from "react";
import { importOwnDeckAction, type DeckState } from "../actions";

/* Sellers with a Google Slides sale deck paste its link instead of listing
   each item by hand; Claude reads it into drafts they check before posting. */
export function DeckImport() {
  const [state, action, pending] = useActionState<DeckState, FormData>(importOwnDeckAction, undefined);
  return (
    <form action={action} className="blk contactbox" style={{ gap: 10, marginBottom: 22 }}>
      <h3 style={{ margin: 0 }}>have your sale in google slides?</h3>
      <p className="sub" style={{ margin: 0 }}>
        paste the link and we&rsquo;ll turn every item into a listing: photos, prices, sizes. sold ones are skipped. you check them before anything is posted.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          className="inp"
          name="url"
          placeholder="https://docs.google.com/presentation/d/…"
          aria-label="google slides link"
          required
          style={{ flex: "1 1 320px" }}
          disabled={pending}
        />
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "reading your slides… (a big deck takes a few minutes)" : "read my slides"}
        </button>
      </div>
      <p className="sub" style={{ margin: 0, fontSize: 12.5 }}>
        the deck needs to be shared as &ldquo;anyone with the link&rdquo;.
      </p>
      {state?.error && (
        <p className="err" role="alert" style={{ margin: 0 }}>
          {state.error}
        </p>
      )}
    </form>
  );
}
