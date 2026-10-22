import { beforeEach, expect, it, vi } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ sql: () => (first: unknown, ...values: unknown[]) => Array.isArray(first) && "raw" in first ? query(first, ...values) : first }));
import { conversationFor, sendMessage, inbox } from "./data";
const id = "10000000-0000-4000-8000-000000000001";
const row = { id, listing_id: null, buyer_netid: "ao5729", seller_netid: "rp4348", last_message_at: "2026-10-21T10:00:00Z", last_sender_netid: "ao5729", buyer_read_at: null, seller_read_at: null };
beforeEach(() => vi.resetAllMocks());
it("opens direct threads without looking up a listing", async () => {
  query.mockResolvedValueOnce([row]).mockResolvedValueOnce([{netid: "ao5729", display_name: "Amel", avatar_path: null}]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  const view = await conversationFor(id, "rp4348");
  expect(view?.listing).toBeNull(); expect(view?.other.netid).toBe("ao5729");
  expect(query.mock.calls.some(c => c[0].join("").includes("from listings"))).toBe(false);
});
it("rejects outsiders when opening or sending to a direct conversation", async () => {
  query.mockResolvedValue([row]);
  expect(await conversationFor(id, "outsider")).toBeNull();
  await expect(sendMessage(id, "outsider", "hi")).rejects.toThrow("doesn't exist");
  expect(query.mock.calls.every(c => c[0].join("").includes("select * from conversations"))).toBe(true);
});
it("includes direct conversations in the inbox without a listing thumbnail", async () => {
  query.mockResolvedValueOnce([row]).mockResolvedValueOnce([{netid: "ao5729", display_name: "Amel", avatar_path: null}]).mockResolvedValueOnce([{conversation_id: id,body: "hello"}]);
  const rows = await inbox("rp4348");
  expect(rows[0]).toMatchObject({id,listing: null,lastMessage: "hello",unread: true});
  expect(query.mock.calls[0][0].join("")).toContain("left join listings");
});
