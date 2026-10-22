import { beforeEach, expect, it, vi } from "vitest";
const {query}=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./db",()=>({sql:()=>query}));
import { startDirectConversation, searchRecipients } from "./directMessages";
beforeEach(()=>vi.resetAllMocks());
it("blocks self and system recipients before querying",async()=>{
 for(const id of ["rp4348","listserv","seed-person","e2e-admin",""]) await expect(startDirectConversation("rp4348",id)).rejects.toThrow();
 expect(query).not.toHaveBeenCalled();
});
it("rejects unregistered recipients",async()=>{
 query.mockResolvedValueOnce([]);
 await expect(startDirectConversation("rp4348","missing")).rejects.toThrow("registered");
 expect(query).toHaveBeenCalledTimes(1);
});
it("uses the same ordered pair in either direction",async()=>{
 query.mockResolvedValue([{id:"thread",netid:"ao5729"}]);
 expect(await startDirectConversation("rp4348","ao5729")).toBe("thread");
 expect(query.mock.calls[1].slice(1)).toEqual(["ao5729","rp4348"]);
 query.mockClear();
 await startDirectConversation("ao5729","rp4348");
 expect(query.mock.calls[1].slice(1)).toEqual(["ao5729","rp4348"]);
 expect(query.mock.calls[1][0].join("?")).toContain("on conflict");
});
it("does not list the user directory without a search",async()=>{
 expect(await searchRecipients("rp4348"," ")).toEqual([]);
 expect(query).not.toHaveBeenCalled();
});
it("returns only public profile fields and uses literal bounded search",async()=>{
 query.mockResolvedValue([{netid:"ao5729",display_name:"Amel",avatar_path:null,phone:"private",payments:[{handle:"private"}]}]);
 expect(await searchRecipients("rp4348","  Amel  ")).toEqual([{netid:"ao5729",displayName:"Amel",avatarUrl:null}]);
 const statement=query.mock.calls[0][0].join("?");
 expect(statement).toContain("limit 20");expect(statement).toContain("netid not like 'seed-%'");
 expect(query.mock.calls[0].slice(1)).toEqual(["rp4348","amel","amel"]);
});
