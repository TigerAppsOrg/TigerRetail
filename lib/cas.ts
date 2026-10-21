/* Princeton CAS (Central Authentication Service), protocol 2.0.

   Three hops, none of which ever shows us the user's password:
     1. We redirect the browser to CAS /login?service=<our callback URL>.
     2. The user signs in on Princeton's page; CAS redirects back to the
        callback with ?ticket=ST-... (single use, expires in seconds).
     3. Our server asks CAS directly: /serviceValidate?service=...&ticket=...
        CAS answers with XML naming the netid. Only a server-to-server answer
        is trusted; the ticket in the URL proves nothing by itself.

   Same flow as TigerAppsOrg/PrincetonCourses (controllers/authentication.js),
   without the library. Pure functions here; the route handlers do the I/O. */

export const CAS_BASE = "https://fed.princeton.edu/cas/";

/* The service URL must be byte-identical at login and at validate, so it is
   always built here and never carries per-request state (that goes in a cookie). */
export const serviceUrl = (appUrl: string) => new URL("/api/auth/callback", appUrl).toString();

export const loginUrl = (appUrl: string) =>
  `${CAS_BASE}login?${new URLSearchParams({ service: serviceUrl(appUrl) })}`;

export const validateUrl = (appUrl: string, ticket: string) =>
  `${CAS_BASE}serviceValidate?${new URLSearchParams({ service: serviceUrl(appUrl), ticket })}`;

export const logoutUrl = (appUrl: string) => `${CAS_BASE}logout?${new URLSearchParams({ url: appUrl })}`;

/* accounts the app owns (listserv imports live under "listserv"); no person may sign in as one.
   Test and sample accounts ("e2e-…", "seed-…") are reserved too: real netids never contain a hyphen. */
export const RESERVED_NETIDS = new Set(["listserv"]);
export const isReservedNetid = (netid: string) => RESERVED_NETIDS.has(netid) || /^(e2e|seed)-/.test(netid);

export type CasResult = { ok: true; netid: string } | { ok: false; code: string; message: string };

/* Reads a CAS 2.0 serviceResponse. Success looks like
     <cas:serviceResponse><cas:authenticationSuccess><cas:user>netid</cas:user>...
   Failure looks like
     <cas:authenticationFailure code="INVALID_TICKET">Ticket ... not recognized</cas:authenticationFailure> */
export function parseServiceResponse(xml: string): CasResult {
  const fail = xml.match(/<cas:authenticationFailure[^>]*code=["']([^"']+)["'][^>]*>([\s\S]*?)<\/cas:authenticationFailure>/);
  if (fail) return { ok: false, code: fail[1], message: fail[2].trim() };

  const user = xml.match(/<cas:authenticationSuccess>[\s\S]*?<cas:user>([\s\S]*?)<\/cas:user>/);
  if (!user) return { ok: false, code: "UNPARSEABLE", message: "CAS response had neither success nor failure" };

  const netid = user[1].trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(netid)) return { ok: false, code: "BAD_NETID", message: `CAS returned an unexpected user: ${netid}` };
  if (isReservedNetid(netid)) return { ok: false, code: "RESERVED_NETID", message: `"${netid}" is a system account and can't sign in` };
  return { ok: true, netid };
}

export async function validateTicket(appUrl: string, ticket: string, fetchImpl: typeof fetch = fetch): Promise<CasResult> {
  const res = await fetchImpl(validateUrl(appUrl, ticket), { cache: "no-store" });
  if (!res.ok) return { ok: false, code: `HTTP_${res.status}`, message: `CAS serviceValidate returned HTTP ${res.status}` };
  return parseServiceResponse(await res.text());
}

/* Where to send the user after login. Only same-site paths, so a crafted
   ?next=https://evil.example can't turn our login into an open redirect. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
