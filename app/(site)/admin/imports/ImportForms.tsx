"use client";
import { useActionState } from "react";
import { importLinkAction, inviteAction, runNowAction, type ImportState } from "../actions";

export function ImportForms({ engineConfigured }: { engineConfigured: boolean }) {
  const [linkState, linkAction, linkPending] = useActionState<ImportState, FormData>(importLinkAction, undefined);
  const [runState, runAction, runPending] = useActionState<ImportState, FormData>(runNowAction, undefined);
  return (
    <div className="two" style={{ gap: 22 }}>
      <form action={linkAction} className="blk contactbox" style={{ gap: 10 }}>
        <h3 style={{ margin: 0 }}>import a deck</h3>
        <input className="inp" name="url" placeholder="https://docs.google.com/presentation/d/…" aria-label="slides link" required />
        <input className="inp" name="subject" placeholder="email subject (optional)" aria-label="email subject" />
        <input className="inp" name="authorName" placeholder="seller's name (optional)" aria-label="seller's name" />
        <input className="inp" name="authorEmail" placeholder="netid@princeton.edu (lets them claim it)" aria-label="seller's email" />
        <button className="btn btn-primary" disabled={linkPending}>
          {linkPending ? "reading the deck…" : "import"}
        </button>
        {linkState?.message && (
          <p className="note" role="status">
            {linkState.message}
          </p>
        )}
        {linkState?.error && <p className="err">{linkState.error}</p>}
      </form>
      <form action={runAction} className="blk contactbox" style={{ gap: 10 }}>
        <h3 style={{ margin: 0 }}>search the listserv</h3>
        <p className="sub" style={{ margin: 0 }}>
          sale emails across the residential listservs: slides links, and sales written in the email with photos. the first run covers the last 30 days; after that each run picks up where the
          last one ended. once deployed this also runs on its own three times a day.
        </p>
        <button className="btn btn-outline" disabled={runPending}>
          {runPending ? "searching…" : "run now"}
        </button>
        {!engineConfigured && <p className="err">InboxEngine isn&rsquo;t set up yet (INBOX_ENGINE_URL / INBOX_ENGINE_TOKEN).</p>}
        {runState?.message && (
          <p className="note" role="status">
            {runState.message}
          </p>
        )}
        {runState?.error && <p className="err">{runState.error}</p>}
      </form>
    </div>
  );
}

/* "send invite" on a sale: emails its poster (Raj's inbox while testing) */
export function InviteButton({ sourceId, invited }: { sourceId: string; invited: string | null }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(inviteAction, undefined);
  return (
    <form action={action} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="sourceId" value={sourceId} />
      <button className="btn btn-outline" disabled={pending} style={{ padding: "6px 14px" }}>
        {pending ? "sending…" : invited ? "send invite again" : "send invite"}
      </button>
      {invited && !state && <span className="sub" style={{ margin: 0 }}>{invited}</span>}
      {state?.message && (
        <span className="note" role="status" style={{ margin: 0 }}>
          {state.message}
        </span>
      )}
      {state?.error && <span className="err">{state.error}</span>}
    </form>
  );
}
