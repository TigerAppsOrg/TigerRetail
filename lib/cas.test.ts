import { describe, expect, it } from "vitest";
import { loginUrl, parseServiceResponse, safeNext, serviceUrl, validateTicket, validateUrl } from "./cas";

const APP = "http://localhost:3000";

describe("CAS URLs", () => {
  it("uses one fixed callback as the service", () => {
    expect(serviceUrl(APP)).toBe("http://localhost:3000/api/auth/callback");
  });
  it("login and validate carry the identical, encoded service", () => {
    const svc = encodeURIComponent(serviceUrl(APP));
    expect(loginUrl(APP)).toBe(`https://fed.princeton.edu/cas/login?service=${svc}`);
    expect(validateUrl(APP, "ST-1-abc")).toBe(`https://fed.princeton.edu/cas/serviceValidate?service=${svc}&ticket=ST-1-abc`);
  });
});

describe("parseServiceResponse", () => {
  it("reads the netid on success", () => {
    const xml = `<cas:serviceResponse xmlns:cas='http://www.yale.edu/tp/cas'>
      <cas:authenticationSuccess>
        <cas:user>  RP1234 </cas:user>
        <cas:attributes><cas:mail>rp1234@princeton.edu</cas:mail></cas:attributes>
      </cas:authenticationSuccess>
    </cas:serviceResponse>`;
    expect(parseServiceResponse(xml)).toEqual({ ok: true, netid: "rp1234" });
  });
  it("reports CAS's failure code", () => {
    const xml = `<cas:serviceResponse xmlns:cas='http://www.yale.edu/tp/cas'>
      <cas:authenticationFailure code="INVALID_TICKET">Ticket ST-1 not recognized</cas:authenticationFailure>
    </cas:serviceResponse>`;
    expect(parseServiceResponse(xml)).toEqual({ ok: false, code: "INVALID_TICKET", message: "Ticket ST-1 not recognized" });
  });
  it("rejects a response with neither", () => {
    expect(parseServiceResponse("<html>maintenance</html>")).toMatchObject({ ok: false, code: "UNPARSEABLE" });
  });
  it.each(["listserv", "e2e-admin", "seed-hm3390"])("never lets anyone sign in as the system/test account %s", (netid) => {
    const xml = `<cas:authenticationSuccess><cas:user>${netid}</cas:user></cas:authenticationSuccess>`;
    expect(parseServiceResponse(xml)).toMatchObject({ ok: false, code: "RESERVED_NETID" });
  });
  it("rejects a user that isn't a netid", () => {
    const xml = `<cas:authenticationSuccess><cas:user>a b@c</cas:user></cas:authenticationSuccess>`;
    expect(parseServiceResponse(xml)).toMatchObject({ ok: false, code: "BAD_NETID" });
  });
});

describe("validateTicket", () => {
  it("asks CAS server-to-server and parses the answer", async () => {
    let asked = "";
    const fakeFetch = (async (url: string) => {
      asked = url;
      return new Response("<cas:authenticationSuccess><cas:user>ab12</cas:user></cas:authenticationSuccess>");
    }) as unknown as typeof fetch;
    expect(await validateTicket(APP, "ST-9", fakeFetch)).toEqual({ ok: true, netid: "ab12" });
    expect(asked).toBe(validateUrl(APP, "ST-9"));
  });
  it("surfaces an HTTP error instead of guessing", async () => {
    const fakeFetch = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
    expect(await validateTicket(APP, "ST-9", fakeFetch)).toMatchObject({ ok: false, code: "HTTP_503" });
  });
});

describe("safeNext", () => {
  it.each([
    [undefined, "/"],
    ["", "/"],
    ["/sell/new", "/sell/new"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
  ])("%s → %s", (input, out) => expect(safeNext(input)).toBe(out));
});
