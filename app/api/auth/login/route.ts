import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { loginUrl, safeNext } from "@/lib/cas";
import { env } from "@/lib/env";
import { NEXT_COOKIE } from "@/lib/session";

/* Step 1 of CAS: remember where the user was headed, then send them to Princeton. */
export async function GET(req: NextRequest) {
  (await cookies()).set(NEXT_COOKIE, safeNext(req.nextUrl.searchParams.get("next")), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  redirect(loginUrl(env.appUrl()));
}
