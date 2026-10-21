import { NextResponse } from "next/server";
import { logoutUrl } from "@/lib/cas";
import { env } from "@/lib/env";
import { endSession } from "@/lib/session";

/* POST (a form button), so another site can't log you out with an <img> tag.
   Ends our session, then Princeton's, so the next login asks for a password again. */
export async function POST() {
  await endSession();
  return NextResponse.redirect(logoutUrl(env.appUrl()), 303);
}
