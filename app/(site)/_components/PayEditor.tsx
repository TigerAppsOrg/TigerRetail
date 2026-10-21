"use client";
import { PAYMENTS } from "@/lib/catalog";

export type PayPick = { id: string; handle: string };

/* The wireframe's payEditor(): every method listed, tick the ones you take,
   handle inline. Also emits plain form fields (pay, handle:<id>) so it works
   inside a Server Action <form>. */
export function PayEditor({ value, onChange }: { value: PayPick[]; onChange: (v: PayPick[]) => void }) {
  const on = (id: string) => value.find((p) => p.id === id);
  const handles: Record<string, string> = Object.fromEntries(value.map((p) => [p.id, p.handle]));
  // typing a handle ticks the method, so the row is never a dead end
  const setHandle = (id: string, handle: string) =>
    onChange(value.some((p) => p.id === id) ? value.map((p) => (p.id === id ? { ...p, handle } : p)) : [...value, { id, handle }]);
  const missing = PAYMENTS.filter((d) => d.needsHandle && on(d.id) && !on(d.id)!.handle.trim());
  return (
    <>
      <div className="paygrid">
        {PAYMENTS.map((d) => {
          const picked = on(d.id);
          const warn = !!picked && d.needsHandle && !picked.handle.trim();
          return (
            <label key={d.id} className={`payrow ${picked ? "on" : ""} ${warn ? "warn" : ""}`}>
              <input
                type="checkbox"
                name="pay"
                value={d.id}
                checked={!!picked}
                onChange={() => onChange(picked ? value.filter((p) => p.id !== d.id) : [...value, { id: d.id, handle: handles[d.id] ?? "" }])}
              />
              <span className="pl">{d.label}</span>
              <input
                className="ph-in"
                type="text"
                name={`handle:${d.id}`}
                value={handles[d.id] ?? ""}
                disabled={!d.needsHandle}
                placeholder={warn ? `add your ${d.hint}` : d.hint}
                aria-label={`${d.label} details`}
                onChange={(e) => setHandle(d.id, e.target.value)}
              />
            </label>
          );
        })}
      </div>
      {missing.length > 0 && <p className="paywarn">add {missing.map((d) => d.label).join(" and ")} details so buyers know where to send it.</p>}
    </>
  );
}
