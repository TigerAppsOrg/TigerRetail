"use client";
/* The open conversation. New messages arrive by asking the server every few
   seconds (no realtime socket yet); sending shows your message immediately. */
import { useEffect, useRef, useState, useTransition } from "react";
import type { Message, Person } from "@/lib/data";
import { MAX_MESSAGE, messageTime } from "@/lib/messaging";
import { pollMessagesAction, sendMessageAction } from "../../actions";

const POLL_MS = 4000;
/* the nav's unread badge listens for this (see Nav) */
export const UNREAD_CHANGED = "tr:unread-changed";

export function Thread({ conversationId, me, other, initial }: { conversationId: string; me: string; other: Person; initial: Message[] }) {
  const [messages, setMessages] = useState<Message[]>(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const lastAt = useRef<string | null>(initial.at(-1)?.createdAt ?? null);

  const add = (incoming: Message[]) =>
    setMessages((xs) => {
      const seen = new Set(xs.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      if (!fresh.length) return xs;
      const all = [...xs, ...fresh];
      lastAt.current = all.at(-1)!.createdAt;
      return all;
    });

  // opening the thread marked it read on the server: let the nav badge catch up
  useEffect(() => {
    window.dispatchEvent(new Event(UNREAD_CHANGED));
  }, [conversationId]);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (document.hidden) return; // a background tab doesn't need to ask
      try {
        const fresh = await pollMessagesAction(conversationId, lastAt.current);
        if (!stopped) add(fresh);
        if (fresh.length) window.dispatchEvent(new Event(UNREAD_CHANGED));
      } catch (e) {
        if (!stopped) setError(`Couldn't check for new messages: ${e instanceof Error ? e.message : e}`);
      }
    };
    const t = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [conversationId]);

  // block body on purpose: newer Chrome returns a Promise from scrollIntoView,
  // and an effect must return nothing or a cleanup function
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = () => {
    const body = draft.trim();
    if (!body || pending) return;
    setError(null);
    startTransition(async () => {
      const r = await sendMessageAction(conversationId, body);
      if (r.error) {
        setError(r.error);
        return;
      }
      setDraft("");
      add([r.message!]);
    });
  };

  return (
    <>
      <div className="thread" aria-live="polite">
        {messages.length === 0 && (
          <p className="sub" style={{ textAlign: "center", margin: "30px auto" }}>
            say hi to {other.displayName || other.netid} &mdash; ask if it&rsquo;s still available, how it fits, or when to pick up.
          </p>
        )}
        {messages.map((m, i) => {
          const mine = m.senderNetid === me;
          const showTime = i === 0 || new Date(m.createdAt).getTime() - new Date(messages[i - 1].createdAt).getTime() > 10 * 60_000;
          return (
            <div key={m.id}>
              {showTime && <div className="msg-time">{messageTime(m.createdAt)}</div>}
              <div className={`msg ${mine ? "mine" : "theirs"}`}>{m.body}</div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          className="inp"
          value={draft}
          rows={1}
          maxLength={MAX_MESSAGE}
          placeholder="write a message"
          aria-label="message"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // enter sends, shift+enter is a new line
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn btn-primary" disabled={!draft.trim() || pending}>
          {pending ? "sending…" : "send"}
        </button>
      </form>
      {error && <p className="err">{error}</p>}
    </>
  );
}
