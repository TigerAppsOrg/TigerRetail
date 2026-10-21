"use client";
import { useRef, useState, useTransition } from "react";
import { setAvatarAction } from "../actions";
import { Avatar } from "../_components/Avatar";
import { downscale } from "../_components/downscale";

/* Profile photo: picking one uploads it right away (shrunk to 512px first). */
export function AvatarEditor({ person }: { person: { netid: string; displayName: string | null; avatarUrl: string | null } }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const send = (f: FormData) =>
    startTransition(async () => {
      const r = await setAvatarAction(f);
      setError(r.error ?? null);
    });

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const small = await downscale(file, 512);
      const f = new FormData();
      f.set("photo", small);
      send(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="avatar-edit">
      <Avatar person={person} size={84} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
        <button type="button" className="btn btn-outline" style={{ padding: "7px 16px" }} disabled={pending} onClick={() => fileRef.current?.click()}>
          {pending ? "saving…" : person.avatarUrl ? "change photo" : "add a photo"}
        </button>
        {person.avatarUrl && (
          <button
            type="button"
            className="link-act"
            style={{ fontSize: 13, color: "var(--muted)" }}
            disabled={pending}
            onClick={() => {
              const f = new FormData();
              f.set("remove", "1");
              send(f);
            }}
          >
            remove photo
          </button>
        )}
        {error && <p className="err">{error}</p>}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        aria-label="profile photo"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
