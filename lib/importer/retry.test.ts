import { beforeEach, expect, it, vi } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({ sql: () => query }));
import type { User } from "../data";
import { startDeck, importEmailSale } from "./importer";
const meta = {messageId: null, subject: "Sale", text: "", listserv: null, authorName: null, authorEmail: null, sentAt: null};
beforeEach(() => vi.resetAllMocks());
it("skips a deck if a manual retry claims it between lookup and update", async () => {
  query.mockResolvedValueOnce([{id: "old", status: "failed"}]).mockResolvedValueOnce([]);
  expect(await startDeck("deck", meta)).toHaveProperty("skipped.status", "skipped");
  expect(query).toHaveBeenCalledTimes(2);
  const statement = query.mock.calls[1][0].join("?");
  expect(statement).toContain("update import_sources");
  expect(statement).toContain("not exists");
  expect(statement).not.toContain("delete");
});
it("reuses the existing deck source when the claim succeeds", async () => {
  query.mockResolvedValueOnce([{id: "old", status: "failed"}]).mockResolvedValueOnce([{id: "old"}]);
  expect(await startDeck("deck", meta)).toEqual({sourceId: "old"});
  expect(query).toHaveBeenCalledTimes(2);
});
it("skips an email if another reader wins the claim", async () => {
  query.mockResolvedValueOnce([{id: "old", status: "failed"}]).mockResolvedValueOnce([]);
  const message = {id: "mail", subject: "Sale", body: "", sender: "Seller", senderEmail: "seller@princeton.edu", sentAt: "2026-10-21", url: "https://example.com", listservs: [], links: [], media: []};
  expect(await importEmailSale(message, [])).toHaveProperty("status", "skipped");
  expect(query).toHaveBeenCalledTimes(2);
  expect(query.mock.calls[1][0].join("?")).toContain("status = 'failed'");
});

it("records seller ownership when a seller retries a failed admin deck", async () => {
  query.mockResolvedValueOnce([{id: "old", status: "failed"}]).mockResolvedValueOnce([{id: "old"}]);
  const owner = {netid: "seller"} as User;
  await startDeck("deck", {...meta, authorEmail: "seller@princeton.edu"}, owner);
  const claim = query.mock.calls[1];
  expect(claim[0].join("?")).toContain("submitted_by =");
  expect(claim.slice(1)).toContain("seller");
  expect(claim.slice(1)).toContain("seller@princeton.edu");
});
