import { describe, expect, it } from "vitest";
import { ago, cleanMessage, isUnread, messageTime, startBlocker, type ConversationState } from "./messaging";

describe("startBlocker", () => {
  const listing = { sellerNetid: "s", status: "active" };
  it("a buyer can ask about an active listing", () => expect(startBlocker(listing, "b", null, false)).toBeNull());
  it("not about your own listing", () => expect(startBlocker(listing, "s", null, false)).toMatch(/your listing/));
  it("not about a sold item", () => expect(startBlocker({ ...listing, status: "sold" }, "b", null, false)).toMatch(/sold/));
  it("a seller can message someone who offered", () => expect(startBlocker(listing, "s", "b", true)).toBeNull());
  it("…but not a stranger", () => expect(startBlocker(listing, "s", "b", false)).toMatch(/made an offer/));
  it("only the seller can pick the buyer", () => expect(startBlocker(listing, "x", "b", true)).toMatch(/Only the seller/));
});

describe("cleanMessage", () => {
  it("trims and keeps line breaks", () => expect(cleanMessage("  hi\r\nthere  ")).toEqual({ ok: true, body: "hi\nthere" }));
  it("rejects empty", () => expect(cleanMessage("   ")).toMatchObject({ ok: false }));
  it("rejects too long", () => expect(cleanMessage("x".repeat(2001))).toMatchObject({ ok: false }));
});

describe("isUnread", () => {
  const c: ConversationState = {
    buyerNetid: "b",
    sellerNetid: "s",
    lastMessageAt: "2026-10-19T20:00:00Z",
    lastSenderNetid: "b",
    buyerReadAt: "2026-10-19T20:00:00Z",
    sellerReadAt: null,
  };
  it("unread for the other side until they look", () => expect(isUnread(c, "s")).toBe(true));
  it("never unread for whoever wrote last", () => expect(isUnread(c, "b")).toBe(false));
  it("read once they've looked since", () => expect(isUnread({ ...c, sellerReadAt: "2026-10-19T20:00:01Z" }, "s")).toBe(false));
  it("an empty conversation is never unread", () => expect(isUnread({ ...c, lastMessageAt: null, lastSenderNetid: null }, "s")).toBe(false));
});

describe("times", () => {
  it("message times are in Princeton time", () => expect(messageTime("2026-10-20T01:30:00Z")).toBe("oct 19 · 9:30 pm"));
  it("inbox ages", () => {
    const now = new Date("2026-10-19T20:00:00Z");
    expect(ago("2026-10-19T19:59:30Z", now)).toBe("now");
    expect(ago("2026-10-19T19:55:00Z", now)).toBe("5m");
    expect(ago("2026-10-19T17:00:00Z", now)).toBe("3h");
    expect(ago("2026-10-17T20:00:00Z", now)).toBe("2d");
    expect(ago("2026-10-01T20:00:00Z", now)).toBe("oct 1");
  });
});
