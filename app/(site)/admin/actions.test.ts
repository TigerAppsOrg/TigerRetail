import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), admin: vi.fn(), dismiss: vi.fn(), retry: vi.fn(), after: vi.fn(), revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); }, redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.user }));
vi.mock("@/lib/importer/admin", () => ({ isAdmin: mocks.admin, approve: vi.fn(), reject: vi.fn(), sendInvite: vi.fn() }));
vi.mock("@/lib/importer/queue", () => ({ dismissSource: mocks.dismiss, retrySource: mocks.retry }));
vi.mock("@/lib/importer/importer", () => ({ finishListservRun: vi.fn(), readDeck: vi.fn(), startDeck: vi.fn(), startListservRun: vi.fn() }));
import { sourceAction } from "./actions";
const id = "10000000-0000-4000-8000-000000000001";
const form = (decision: string, sourceId = id) => { const f = new FormData(); f.set("decision", decision); f.set("sourceId", sourceId); return f; };
beforeEach(() => { vi.resetAllMocks(); mocks.user.mockResolvedValue({ netid: "rp4348" }); mocks.admin.mockReturnValue(true); });
it("blocks non-admins before changing imports", async () => {
  mocks.admin.mockReturnValue(false);
  await expect(sourceAction(undefined, form("done"))).rejects.toThrow("404");
  expect(mocks.dismiss).not.toHaveBeenCalled(); expect(mocks.retry).not.toHaveBeenCalled();
});
it("rejects malformed source IDs and unknown decisions", async () => {
  expect(await sourceAction(undefined, form("done", "bad"))).toHaveProperty("error");
  expect(await sourceAction(undefined, form("delete"))).toHaveProperty("error");
  expect(mocks.dismiss).not.toHaveBeenCalled(); expect(mocks.retry).not.toHaveBeenCalled();
});
it("clears completed sources and refreshes the queue", async () => {
  mocks.dismiss.mockResolvedValue(undefined);
  expect(await sourceAction(undefined, form("done"))).toHaveProperty("message");
  expect(mocks.dismiss).toHaveBeenCalledWith(id); expect(mocks.revalidate).toHaveBeenCalledWith("/admin/imports");
});
it("claims a retry before scheduling its slow work after the response", async () => {
  const read = vi.fn(); mocks.retry.mockResolvedValue(read);
  expect(await sourceAction(undefined, form("retry"))).toHaveProperty("message");
  expect(mocks.retry).toHaveBeenCalledWith(id); expect(mocks.after).toHaveBeenCalledWith(read); expect(read).not.toHaveBeenCalled();
});
it("shows errors without scheduling another retry", async () => {
  mocks.retry.mockRejectedValue(new Error("Already being read."));
  expect(await sourceAction(undefined, form("retry"))).toEqual({error: "Already being read."});
  expect(mocks.after).not.toHaveBeenCalled();
});
it("keeps rows with unreviewed listings visible", async () => {
  mocks.dismiss.mockRejectedValue(new Error("Review the remaining items first."));
  expect(await sourceAction(undefined, form("done"))).toEqual({error: "Review the remaining items first."});
});
