import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { safeNext } from "@/lib/cas";
import { ProfileForm } from "../_components/ProfileForm";

/* PRD #5 / wireframe V.onboarding step 1: collect phone + payment once, so
   listing and offering are one step later. (The wireframe's step 2, sizes,
   comes with "fits me" filtering.) */
export default function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  return (
    <div className="wf">
      <div className="wrap center-screen">
        <div style={{ display: "grid", placeItems: "center", gap: 24, width: "100%" }}>
          <div className="wordmark" style={{ fontSize: 40 }}>
            dePAWp
          </div>
          <div className="card-form" style={{ width: "min(560px,100%)" }}>
            <h2>two quick things</h2>
            <p className="sub" style={{ margin: 0 }}>
              fill these in now and selling later takes about four clicks.
            </p>
            <Suspense fallback={<p className="sub">loading…</p>}>
              <Onboarding searchParams={searchParams} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

async function Onboarding({ searchParams }: { searchParams: PageProps<"/onboarding">["searchParams"] }) {
  const q = await searchParams;
  const next = safeNext(typeof q.next === "string" ? q.next : null);
  const user = await requireUser(`/onboarding?next=${encodeURIComponent(next)}`, { onboarded: false });
  if (user.onboarded) redirect(next);
  return <ProfileForm defaults={{ phone: "", payments: [], building: "", roomDirections: "" }} next={next} submitLabel="start browsing" />;
}
