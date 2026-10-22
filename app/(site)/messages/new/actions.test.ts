import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), start: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({requireUser: m.user}));
vi.mock("@/lib/directMessages", () => ({startDirectConversation: m.start}));
vi.mock("next/navigation", () => ({redirect: m.redirect}));
import { newMessageAction } from "./actions";
const form = () => { const f = new FormData(); f.set("recipient","ao5729"); f.set("viewer","fake"); return f; };
beforeEach(() => {vi.resetAllMocks();m.user.mockResolvedValue({netid:"rp4348"});});
it("requires a signed-in user before creating a conversation",async()=>{
 m.user.mockRejectedValue(new Error("login"));
 await expect(newMessageAction({},form())).rejects.toThrow("login");expect(m.start).not.toHaveBeenCalled();
});
it("uses the session identity and redirects to the selected thread",async()=>{
 m.start.mockResolvedValue("thread");await newMessageAction({},form());
 expect(m.start).toHaveBeenCalledWith("rp4348","ao5729");expect(m.redirect).toHaveBeenCalledWith("/messages/thread");
});
it("shows recipient errors without redirecting",async()=>{
 m.start.mockRejectedValue(new Error("not registered"));
 expect(await newMessageAction({},form())).toEqual({error:"not registered"});expect(m.redirect).not.toHaveBeenCalled();
});
