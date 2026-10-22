import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({query:vi.fn(),send:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("../db",()=>({sql:()=>Object.assign((first:unknown,...values:unknown[])=>Array.isArray(first)&&"raw" in first?m.query(first,...values):first,{begin:async(fn:(tx:unknown)=>unknown)=>fn((first:unknown,...values:unknown[])=>m.query(first,...values))})}));
vi.mock("../mail",()=>({sendMail:m.send}));
import { approveSaleAndInvite, sendInvite } from "./admin";
const id="10000000-0000-4000-8000-000000000001";
const source={id,kind:"deck",author_email:"seller@princeton.edu",subject:"Sale",author_name:"Seller",invited_at:null,invited_to:null};
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("APP_URL","https://retail.tigerapps.org");vi.stubEnv("INVITES_TO_SELLERS","");vi.stubEnv("INVITE_TEST_RECIPIENT","rp4348@princeton.edu");});
it("publishes the sale before sending one automatic test invite",async()=>{
 m.query.mockResolvedValueOnce([{id}]).mockResolvedValueOnce([{id:"item"}]).mockResolvedValueOnce([source]).mockResolvedValueOnce([{id:"item"}]).mockResolvedValueOnce([]);
 const result=await approveSaleAndInvite(id);
 expect(result).toContain("Test invite");expect(m.send).toHaveBeenCalledTimes(1);expect(m.send.mock.calls[0][0].to).toBe("rp4348@princeton.edu");
 expect(m.query.mock.calls[1][0].join("")).toContain("status = 'active'");
});
it("does not automatically resend an invite already delivered to that recipient",async()=>{
 m.query.mockResolvedValueOnce([ {...source,invited_at:"2026-10-01T00:00:00Z",invited_to:"rp4348@princeton.edu"} ]);
 const result=await sendInvite(id,{once:true});expect(result.alreadySent).toBe(true);expect(m.send).not.toHaveBeenCalled();
});
it("reports email failure while leaving approval successful",async()=>{
 m.query.mockResolvedValueOnce([{id}]).mockResolvedValueOnce([{id:"item"}]).mockResolvedValueOnce([source]).mockResolvedValueOnce([{id:"item"}]);m.send.mockRejectedValue(new Error("mail unavailable"));
 expect(await approveSaleAndInvite(id)).toContain("Items approved, but the invite was not sent: mail unavailable");
});
it("does not send if the source has no approved unclaimed listings",async()=>{
 m.query.mockResolvedValueOnce([source]).mockResolvedValueOnce([]);
 await expect(sendInvite(id,{once:true})).rejects.toThrow("approved");expect(m.send).not.toHaveBeenCalled();
});

afterEach(()=>vi.unstubAllEnvs());
it("does not approve or invite an unfinished or seller-owned source",async()=>{
 m.query.mockResolvedValueOnce([]);await expect(approveSaleAndInvite(id)).rejects.toThrow("not ready");expect(m.send).not.toHaveBeenCalled();expect(m.query).toHaveBeenCalledTimes(1);
});
it("locks the source while sending and records delivery only after success",async()=>{
 m.query.mockResolvedValueOnce([source]).mockResolvedValueOnce([{id:"item"}]).mockResolvedValueOnce([]);
 await sendInvite(id,{once:true});expect(m.query.mock.calls[0][0].join("")).toContain("for update");
 expect(m.send.mock.invocationCallOrder[0]).toBeLessThan(m.query.mock.invocationCallOrder[2]);
});
