import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "./session";
import { getUser, type User } from "./data";

/* The signed-in user, or null for a visitor. Browsing is public; posting and
   offering need a Princeton login. */
export async function getViewer(): Promise<User | null> {
  const { netid } = await getSession();
  return netid ? getUser(netid) : null;
}

/* For pages and actions that need a signed-in, onboarded user. `here` is
   where to come back to after CAS. */
export async function requireUser(here: string, { onboarded = true } = {}): Promise<User> {
  const user = await getViewer();
  if (!user) redirect(`/login?next=${encodeURIComponent(here)}`);
  if (onboarded && !user.onboarded) redirect(`/onboarding?next=${encodeURIComponent(here)}`);
  return user;
}
