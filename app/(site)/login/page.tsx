import { Suspense } from "react";
import { safeNext } from "@/lib/cas";

const ERRORS: Record<string, string> = {
  missing_ticket: "Princeton didn't send a login ticket back. Try again.",
  INVALID_TICKET: "That login expired before we could check it. Try again.",
};

/* Styled like the wireframe's landing card. */
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="wf">
      <div className="wrap center-screen">
        <div style={{ display: "grid", placeItems: "center", gap: 24, width: "100%" }}>
          <div className="wordmark" style={{ fontSize: 40 }}>
            dePAWp
          </div>
          <div className="card-form">
            <h2>sign in</h2>
            <p className="sub" style={{ margin: 0 }}>
              princeton&rsquo;s marketplace for the stuff you&rsquo;re done with. sign in with your netid through princeton&rsquo;s CAS &mdash; we never
              see your password.
            </p>
            <Suspense fallback={null}>
              <LoginButton searchParams={searchParams} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

async function LoginButton({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const q = await searchParams;
  const next = safeNext(typeof q.next === "string" ? q.next : null);
  const error = typeof q.error === "string" ? (ERRORS[q.error] ?? `Login failed (${q.error}). Try again.`) : null;
  return (
    <>
      {error && <div className="errbox">{error}</div>}
      {/* a plain link, not <Link>: the route handler redirects off-site to CAS */}
      <a className="btn btn-primary btn-block" href={`/api/auth/login?next=${encodeURIComponent(next)}`}>
        Sign in with Princeton CAS
      </a>
    </>
  );
}
