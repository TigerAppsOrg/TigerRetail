import "server-only";
/* Sending email. SendGrid when SENDGRID_API_KEY is set: TigerApps' account is
   authenticated for princeton.edu, so mail can come from
   tigerretail@princeton.edu (TigerSnatch sends the same way). Otherwise
   Resend (resend.com), whose sandbox only reaches the account's own address
   until a domain is verified. Neither set: nothing is sent, and the error
   says so. */
import { parseFrom, sendgridBody, type Mail } from "./mailFormat";

export type { Mail };

export async function sendMail(m: Mail): Promise<{ id: string; via: "sendgrid" | "resend" }> {
  if (process.env.SENDGRID_API_KEY) return { ...(await viaSendgrid(m, process.env.SENDGRID_API_KEY)), via: "sendgrid" };
  if (process.env.RESEND_API_KEY) return { ...(await viaResend(m, process.env.RESEND_API_KEY)), via: "resend" };
  throw new Error("No email service is set up: add SENDGRID_API_KEY (or RESEND_API_KEY) to .env.local.");
}

/* POST https://api.sendgrid.com/v3/mail/send: 202 Accepted with an empty body,
   the message id in X-Message-Id. Errors come back as { errors: [{ message }] }. */
async function viaSendgrid(m: Mail, key: string): Promise<{ id: string }> {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error("MAIL_FROM isn't set: SendGrid needs the address to send from, like TigerRetail <tigerretail@princeton.edu>.");
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(sendgridBody(m, parseFrom(from))),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    let why = body.slice(0, 300);
    try {
      why = (JSON.parse(body) as { errors?: { message: string }[] }).errors?.map((e) => e.message).join("; ") || why;
    } catch {
      // not JSON: keep the raw text
    }
    throw new Error(`SendGrid returned ${res.status}: ${why}`);
  }
  return { id: res.headers.get("x-message-id") ?? "" };
}

/* resend.com/docs/api-reference/emails/send-email */
async function viaResend(m: Mail, key: string): Promise<{ id: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "user-agent": "tigerretail/1.0", // Resend rejects requests without one
      ...(m.idempotencyKey ? { "idempotency-key": m.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || "TigerRetail <onboarding@resend.dev>",
      to: m.to,
      subject: m.subject,
      text: m.text,
      html: m.html,
      ...(m.replyTo ? { reply_to: m.replyTo } : {}),
    }),
    cache: "no-store",
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend returned ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body) as { id: string };
}
