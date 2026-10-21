/* Email formatting, pure (lib/mail.ts sends). */

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  idempotencyKey?: string; // Resend: the same key within 24h sends once (SendGrid has none)
}

const ADDRESS = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i;

/* MAIL_FROM: "TigerRetail <tigerretail@princeton.edu>" or a bare address */
export function parseFrom(raw: string): { name: string | null; email: string } {
  const t = raw.trim();
  const m = t.match(/^"?([^"<]*?)"?\s*<([^>]+)>$/);
  const name = m ? m[1].trim() || null : null;
  const email = (m ? m[2] : t).trim();
  if (!ADDRESS.test(email)) throw new Error(`MAIL_FROM isn't an email address ("${raw}"). Set it like: TigerRetail <tigerretail@princeton.edu>`);
  return { name, email };
}

/* SendGrid v3 mail/send body. Plain text must come before HTML. */
export function sendgridBody(m: Mail, from: { name: string | null; email: string }) {
  return {
    personalizations: [{ to: [{ email: m.to }] }],
    from: from.name ? { email: from.email, name: from.name } : { email: from.email },
    ...(m.replyTo ? { reply_to: { email: m.replyTo } } : {}),
    subject: m.subject,
    content: [
      { type: "text/plain", value: m.text },
      { type: "text/html", value: m.html },
    ],
  };
}
