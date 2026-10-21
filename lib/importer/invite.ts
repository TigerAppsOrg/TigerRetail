/* Inviting the person who posted a listserv sale to join and manage it.
   Pure: who the email goes to, and what it says. Sending is in mail.ts. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/* While testing, every invite goes to INVITE_TEST_RECIPIENT (Raj), never the
   seller. Only INVITES_TO_SELLERS=on sends to the real person. No test inbox
   set means nothing is sent: we don't guess. */
export function inviteRecipient(intended: string, env: Record<string, string | undefined>): { to: string; test: boolean } {
  if (env.INVITES_TO_SELLERS === "on") return { to: intended, test: false };
  const test = (env.INVITE_TEST_RECIPIENT ?? "").trim();
  if (!EMAIL_RE.test(test)) {
    throw new Error("Invites are in test mode and INVITE_TEST_RECIPIENT isn't set to an email address, so nothing was sent. Add it to .env.local.");
  }
  return { to: test, test: true };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function inviteEmail(p: { name: string | null; sale: string; count: number; url: string; intended: string; test: boolean }) {
  const first = p.name?.trim().split(/\s+/)[0] || "there";
  const items = p.count === 1 ? "your item is" : `${p.count} of your items are`;
  const subject = `${p.test ? `[TEST for ${p.intended}] ` : ""}Join TigerRetail: ${items} already up`;
  const one = p.count === 1;
  const them = one ? "it" : "them";
  const lines = [
    `Hi ${first},`,
    "",
    `We saw your sale on the listserv ("${p.sale}") and put ${one ? "your item" : `${p.count} of your items`} on TigerRetail, Princeton's new student marketplace, with the photos, prices and contact details from your post.`,
    "",
    `Sign in once with your Princeton netid to create your account. Buyers can then message you in the app, and you can take down anything that's sold or that you'd rather not list.`,
    "",
    `Add the dorm you live in when you sign in and we'll add it to ${one ? "your listing" : "all of your listings"}, so buyers can find ${them} on the campus map too.`,
    "",
    `See your listings: ${p.url}`,
    "",
    `Don't want ${them} listed? Sign in and take ${them} down; it's one click.`,
  ];
  const text = [...(p.test ? [`TEST: this invite would go to ${p.intended}.`, ""] : []), ...lines].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:520px">
${p.test ? `<p style="background:#fff3cd;padding:8px 12px;border-radius:6px">TEST: this invite would go to ${esc(p.intended)}.</p>` : ""}
<p>Hi ${esc(first)},</p>
<p>We saw your sale on the listserv (&ldquo;${esc(p.sale)}&rdquo;) and put ${one ? "your item" : `${p.count} of your items`} on TigerRetail, Princeton&rsquo;s new student marketplace, with the photos, prices and contact details from your post.</p>
<p>Sign in once with your Princeton netid to create your account. Buyers can then message you in the app, and you can take down anything that&rsquo;s sold or that you&rsquo;d rather not list.</p>
<p>Add the dorm you live in when you sign in and we&rsquo;ll add it to ${one ? "your listing" : "all of your listings"}, so buyers can find ${them} on the campus map too.</p>
<p><a href="${esc(p.url)}" style="display:inline-block;background:#c2501f;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none">see your listings</a></p>
<p style="color:#666;font-size:13px">Don&rsquo;t want ${them} listed? Sign in and take ${them} down; it&rsquo;s one click.</p>
</div>`;
  return { subject, text, html };
}
