"use client";
import { useActionState, useEffect, useMemo, useState } from "react";
import type { Building } from "@/components/campus-map/types";
import { fetchResidentialBuildings } from "@/components/campus-map/princeton";
import { tidyCollege } from "@/components/campus-map/logic/catalog";
import { saveProfileAction, type FormState } from "../actions";
import { PayEditor, type PayPick } from "./PayEditor";

export interface ProfileDefaults {
  phone: string;
  payments: PayPick[];
  building: string;
  roomDirections: string;
}
export interface AboutDefaults {
  displayName: string;
  bio: string;
}

/* Onboarding (PRD #5, wireframe "two quick things") and settings (PRD #6)
   are the same form. Building is ours, not the wireframe's: it places your
   pin on the campus map. */
export function ProfileForm({
  defaults,
  about,
  next,
  submitLabel,
}: {
  defaults: ProfileDefaults;
  about?: AboutDefaults; // the profile page edits these too; onboarding doesn't ask
  next: string;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProfileAction, undefined);
  const [payments, setPayments] = useState<PayPick[]>(defaults.payments);
  const v = state?.values;
  const e = state?.errors ?? {};

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <input type="hidden" name="next" value={next} />
      {about && (
        <>
          <div className="field">
            <label htmlFor="pf-name">name (how you show up on listings and offers)</label>
            <input className="inp" id="pf-name" name="displayName" maxLength={40} placeholder="e.g. Raj P." defaultValue={(v?.displayName as string) ?? about.displayName} />
            {e.displayName && <p className="err">{e.displayName}</p>}
          </div>
          <div className="field">
            <label htmlFor="pf-bio">bio (optional)</label>
            <input className="inp" id="pf-bio" name="bio" maxLength={160} placeholder="e.g. selling everything before I move out in may" defaultValue={(v?.bio as string) ?? about.bio} />
            {e.bio && <p className="err">{e.bio}</p>}
          </div>
          <h3 className="pf-sub">contact + pickup</h3>
          <p className="sub" style={{ margin: "-10px 0 0" }}>
            only a buyer whose offer you accept sees these.
          </p>
        </>
      )}
      <div className="field">
        <label htmlFor="pf-phone">phone number</label>
        <input className="inp" id="pf-phone" name="phone" type="tel" autoComplete="tel" placeholder="609-555-0142" defaultValue={(v?.phone as string) ?? defaults.phone} required />
        {e.phone && <p className="err">{e.phone}</p>}
      </div>
      <div className="field">
        <label>
          preferred transaction methods <span className="muted">&mdash; pick as many as you take</span>
        </label>
        <PayEditor value={payments} onChange={setPayments} />
        {e.payments && <p className="err">{e.payments}</p>}
      </div>
      <BuildingSelect defaultValue={(v?.building as string) ?? defaults.building} error={e.building} />
      <div className="field">
        <label htmlFor="pf-room">how to find your room (optional &mdash; only shown to a buyer whose offer you accept)</label>
        <input className="inp" id="pf-room" name="roomDirections" placeholder="2nd floor, two lefts out of the stairwell" defaultValue={(v?.roomDirections as string) ?? defaults.roomDirections} />
        {e.roomDirections && <p className="err">{e.roomDirections}</p>}
      </div>
      <button className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "saving…" : submitLabel}
      </button>
    </form>
  );
}

/* Dorms come straight from Princeton's Buildings layer, so the name always
   matches what the map uses to place your pin. */
export function BuildingSelect({ defaultValue, error }: { defaultValue: string; error?: string }) {
  const [buildings, setBuildings] = useState<Building[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    fetchResidentialBuildings(ac.signal)
      .then((b) => {
        setBuildings(b);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!ac.signal.aborted) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => ac.abort();
  }, [attempt]);

  const byCollege = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const b of buildings ?? []) {
      const c = tidyCollege(b.college);
      m.set(c, [...(m.get(c) ?? []), b.name]);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([c, names]) => [c, [...new Set(names)].sort()] as const);
  }, [buildings]);

  return (
    <div className="field">
      <label htmlFor="pf-building">where you live (your pin on the map)</label>
      {loadError ? (
        <p className="err">
          Couldn&rsquo;t load Princeton&rsquo;s building list: {loadError}{" "}
          <button type="button" className="link-act" onClick={() => setAttempt((n) => n + 1)}>
            retry
          </button>
        </p>
      ) : (
        <select id="pf-building" name="building" key={buildings ? "loaded" : "loading"} defaultValue={defaultValue} required disabled={!buildings}>
          <option value="">{buildings ? "pick your building" : "loading buildings…"}</option>
          {byCollege.map(([college, names]) => (
            <optgroup key={college} label={college}>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
      {error && <p className="err">{error}</p>}
    </div>
  );
}
