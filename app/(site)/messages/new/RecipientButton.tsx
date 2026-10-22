"use client";
import { useActionState } from "react";
import { newMessageAction } from "./actions";
export function RecipientButton({ netid }: { netid: string }) {
  const [state, action, pending] = useActionState(newMessageAction, {});
  return <form action={action}>
    <input type="hidden" name="recipient" value={netid} />
    <button className="btn btn-primary" disabled={pending}>{pending ? "opening…" : "message"}</button>
    {state.error && <p className="err" role="alert">{state.error}</p>}
  </form>;
}
