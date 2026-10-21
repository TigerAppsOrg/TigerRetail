import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { sealData, unsealData } from "iron-session";
import { env } from "./env";

/* The whole session is the CAS netid, sealed (encrypted + signed) into an
   httpOnly cookie. No session table: the cookie can't be forged without
   SESSION_SECRET, and it expires on its own. */
export type Session = { netid?: string };

export const SESSION_COOKIE = "tr_session";
export const NEXT_COOKIE = "tr_next"; // where to land after CAS; kept out of the service URL
const TTL = 60 * 60 * 24 * 14; // two weeks

export async function getSession(): Promise<Session> {
  const seal = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!seal) return {};
  // Unsealing checks expiry against the clock; with Cache Components the clock
  // may only be read at request time, never while prerendering.
  await connection();
  return unsealData<Session>(seal, {
    password: env.sessionSecret(),
    ttl: TTL,
    onUnsealError: (reason) => {
      if (reason !== "expired") console.warn(`[session] discarded cookie: ${reason}`);
    },
  });
}

export async function startSession(netid: string) {
  const seal = await sealData({ netid } satisfies Session, { password: env.sessionSecret(), ttl: TTL });
  (await cookies()).set(SESSION_COOKIE, seal, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL - 60,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
