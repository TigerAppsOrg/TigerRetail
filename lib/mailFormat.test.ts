import { describe, expect, it } from "vitest";
import { parseFrom, sendgridBody } from "./mailFormat";

describe("parseFrom (MAIL_FROM → who the email is from)", () => {
  it.each([
    ["TigerRetail <tigerretail@princeton.edu>", { name: "TigerRetail", email: "tigerretail@princeton.edu" }],
    ['"TigerRetail" <tigerretail@princeton.edu>', { name: "TigerRetail", email: "tigerretail@princeton.edu" }],
    ["tigerretail@princeton.edu", { name: null, email: "tigerretail@princeton.edu" }],
  ])("%s", (raw, out) => expect(parseFrom(raw)).toEqual(out));
  it("refuses something that isn't an address, rather than send from nowhere", () => {
    expect(() => parseFrom("TigerRetail")).toThrow(/MAIL_FROM/);
    expect(() => parseFrom("")).toThrow(/MAIL_FROM/);
  });
});

describe("sendgridBody (SendGrid v3 mail/send)", () => {
  const mail = { to: "rp4348@princeton.edu", subject: "Join TigerRetail", text: "hi", html: "<p>hi</p>" };
  it("one recipient, from name and address, plain text before html", () => {
    expect(sendgridBody(mail, { name: "TigerRetail", email: "tigerretail@princeton.edu" })).toEqual({
      personalizations: [{ to: [{ email: "rp4348@princeton.edu" }] }],
      from: { email: "tigerretail@princeton.edu", name: "TigerRetail" },
      subject: "Join TigerRetail",
      content: [
        { type: "text/plain", value: "hi" },
        { type: "text/html", value: "<p>hi</p>" },
      ],
    });
  });
  it("adds reply_to when given, and leaves out a missing name", () => {
    const body = sendgridBody({ ...mail, replyTo: "tigerapp@princeton.edu" }, { name: null, email: "tigerretail@princeton.edu" });
    expect(body.from).toEqual({ email: "tigerretail@princeton.edu" });
    expect(body.reply_to).toEqual({ email: "tigerapp@princeton.edu" });
  });
});
