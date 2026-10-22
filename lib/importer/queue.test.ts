import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ query: vi.fn(), deck: vi.fn(), email: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({ sql: () => m.query }));
vi.mock("./importer", () => ({ readDeck: m.deck, readEmailSource: m.email }));
import { dismissSource, retrySource } from "./queue";
beforeEach(() => vi.resetAllMocks());
it("does not read anything when another request has claimed the source", async () => {
  m.query.mockResolvedValue([]);
  await expect(retrySource("id")).rejects.toThrow("already running");
  expect(m.deck).not.toHaveBeenCalled(); expect(m.email).not.toHaveBeenCalled();
});
it("retains the source ID and seller metadata on a deck retry", async () => {
  m.query.mockResolvedValue([{kind: "deck", deck_id: "slides", message_id: "mail", subject: "Sale", listserv: "butler", author_name: "Seller", author_email: "seller@princeton.edu", sent_at: "2026-10-21"}]);
  const read = await retrySource("source-id");
  expect(m.deck).not.toHaveBeenCalled();
  await read();
  expect(m.deck).toHaveBeenCalledWith("source-id", "slides", {messageId: "mail", subject: "Sale", text: "", listserv: "butler", authorName: "Seller", authorEmail: "seller@princeton.edu", sentAt: "2026-10-21"});
});
it("retries email sources through the email reader with the same ID", async () => {
  m.query.mockResolvedValue([{kind: "email", message_id: "mail"}]);
  await (await retrySource("source-id"))();
  expect(m.email).toHaveBeenCalledWith("source-id", "mail"); expect(m.deck).not.toHaveBeenCalled();
});
it("records background fetch failures so they can be retried again", async () => {
  m.query.mockResolvedValue([{kind: "email", message_id: "mail"}]);
  m.email.mockRejectedValue(new Error("Inbox unavailable"));
  await (await retrySource("source-id"))();
  expect(m.query).toHaveBeenCalledTimes(2);
  expect(m.query.mock.calls[1].slice(1)).toEqual(["Inbox unavailable", "source-id"]);
});
it("rejects dismissal when the database guard does not match", async () => {
  m.query.mockResolvedValue([]);
  await expect(dismissSource("source-id")).rejects.toThrow("Review the remaining items");
});
it("clears a completed row with one update, without deleting listings", async () => {
  m.query.mockResolvedValue([{id: "source-id"}]);
  await dismissSource("source-id");
  expect(m.query).toHaveBeenCalledTimes(1);
  const statement = m.query.mock.calls[0][0].join("?");
  expect(statement).toContain("status = 'done'");
  expect(statement).toContain("status = 'review'");
  expect(statement).not.toMatch(/delete/i);
});
