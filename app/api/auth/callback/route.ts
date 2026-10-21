import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeNext, validateTicket } from "@/lib/cas";
import { ensureUser } from "@/lib/data";
import { env } from "@/lib/env";
import { NEXT_COOKIE, startSession } from "@/lib/session";

/* Steps 2–3 of CAS: Princeton sent the browser back with a one-time ticket.
   Ask CAS directly whose ticket it is, then start our own session. */
export async function GET(req: NextRequest) {
  const ticket = req.nextUrl.searchParams.get("ticket");
  if (!ticket) redirect("/login?error=missing_ticket");

  const result = await validateTicket(env.appUrl(), ticket);
  if (!result.ok) {
    console.error(`[cas] ticket rejected: ${result.code} ${result.message}`);
    redirect(`/login?error=${encodeURIComponent(result.code)}`);
  }

  const user = await ensureUser(result.netid);
  await startSession(user.netid);

  const jar = await cookies();
  const next = safeNext(jar.get(NEXT_COOKIE)?.value);
  jar.delete(NEXT_COOKIE);
  // an invited seller lands straight on their sale: one sign-in is the whole ask
  const invite = next.startsWith("/welcome/");
  redirect(user.onboarded || invite ? next : `/onboarding?next=${encodeURIComponent(next)}`);
}
