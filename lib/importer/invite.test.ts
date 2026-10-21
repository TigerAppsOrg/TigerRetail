import { describe, expect, it } from "vitest";
import { inviteEmail, inviteRecipient } from "./invite";

describe("inviteRecipient (no real seller gets mail while testing)", () => {
  it("sends to the test inbox unless invites to sellers are switched on", () => {
    expect(inviteRecipient("jr0001@princeton.edu", { INVITE_TEST_RECIPIENT: "rp4348@princeton.edu" })).toEqual({ to: "rp4348@princeton.edu", test: true });
    expect(inviteRecipient("jr0001@princeton.edu", { INVITE_TEST_RECIPIENT: "rp4348@princeton.edu", INVITES_TO_SELLERS: "yes" })).toEqual({ to: "rp4348@princeton.edu", test: true });
  });
  it("only INVITES_TO_SELLERS=on reaches the seller", () => {
    expect(inviteRecipient("jr0001@princeton.edu", { INVITES_TO_SELLERS: "on" })).toEqual({ to: "jr0001@princeton.edu", test: false });
  });
  it("refuses to send with no test inbox set, rather than guess", () => {
    expect(() => inviteRecipient("jr0001@princeton.edu", {})).toThrow(/INVITE_TEST_RECIPIENT/);
    expect(() => inviteRecipient("jr0001@princeton.edu", { INVITE_TEST_RECIPIENT: "not an email" })).toThrow(/INVITE_TEST_RECIPIENT/);
  });
});

describe("inviteEmail", () => {
  const base = { name: "Jamie Rivera", sale: "Senior Sale (winter wear)", count: 11, url: "http://localhost:3000/welcome/abc", intended: "jr0001@princeton.edu", test: false };
  it("says what we did and where to go, in text and html", () => {
    const m = inviteEmail(base);
    expect(m.subject).toBe("Join TigerRetail: 11 of your items are already up");
    expect(m.text).toContain("Hi Jamie,");
    expect(m.text).toContain("Senior Sale (winter wear)");
    expect(m.text).toContain("http://localhost:3000/welcome/abc");
    expect(m.html).toContain('href="http://localhost:3000/welcome/abc"');
    expect(m.text).not.toContain("TEST");
    expect(m.text).toContain("put 11 of your items on TigerRetail, Princeton's new student marketplace");
    expect(m.text).toContain("Sign in once with your Princeton netid to create your account");
    expect(m.text).toContain("Add the dorm you live in");
    expect(m.html).toContain("campus map");
  });
  it("escapes what came from the listserv in the html", () => {
    const m = inviteEmail({ ...base, name: "<b>Eve</b>", sale: 'sale "<script>"' });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
  });
  it("a test send says who it was really for", () => {
    const m = inviteEmail({ ...base, test: true });
    expect(m.subject).toBe("[TEST for jr0001@princeton.edu] Join TigerRetail: 11 of your items are already up");
    expect(m.text).toContain("TEST: this invite would go to jr0001@princeton.edu");
  });
  it("one item, and no name", () => {
    const m = inviteEmail({ ...base, name: null, count: 1 });
    expect(m.subject).toBe("Join TigerRetail: your item is already up");
    expect(m.text).toContain("Hi there,");
    expect(m.text).toContain("put your item on TigerRetail");
    expect(m.text).toContain("take it down");
  });
});
