"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { startDirectConversation } from "@/lib/directMessages";

export async function newMessageAction(_: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const user = await requireUser("/messages/new");
  let id: string;
  try {
    id = await startDirectConversation(user.netid, String(form.get("recipient") ?? ""));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not open the conversation." };
  }
  redirect(`/messages/${id}`);
}
