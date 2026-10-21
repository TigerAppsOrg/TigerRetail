import { describe, expect, it } from "vitest";
import { databaseUrl, masked, upsertEnv } from "./env-file.mjs";

describe("databaseUrl", () => {
  const base = { host: "db.tigerapps.org", port: "5432", database: "tigerretail_dev", username: "tigerretail", password: "abc123", ssl: true };
  it("builds the URL with SSL", () => {
    expect(databaseUrl(base)).toBe("postgresql://tigerretail:abc123@db.tigerapps.org:5432/tigerretail_dev?sslmode=require");
  });
  it("encodes a password with symbols, so it can't break the URL", () => {
    expect(databaseUrl({ ...base, password: "p@ss:w/rd#1?%" })).toBe(
      "postgresql://tigerretail:p%40ss%3Aw%2Frd%231%3F%25@db.tigerapps.org:5432/tigerretail_dev?sslmode=require",
    );
  });
  it("defaults the port, drops a pasted scheme or path from the host, no SSL when off", () => {
    expect(databaseUrl({ ...base, port: "", host: "postgres://db.tigerapps.org/", ssl: false })).toBe(
      "postgresql://tigerretail:abc123@db.tigerapps.org:5432/tigerretail_dev",
    );
  });
  it("refuses empty parts and a bad port", () => {
    expect(() => databaseUrl({ ...base, password: "" })).toThrow(/password/);
    expect(() => databaseUrl({ ...base, port: "54a2" })).toThrow(/port/);
  });
});

describe("upsertEnv", () => {
  it("replaces a key where it is and appends new ones, keeping everything else", () => {
    const before = "# settings\nSESSION_SECRET=x\nDATABASE_URL=old\n";
    expect(upsertEnv(before, { DATABASE_URL: "postgresql://a", S3_BUCKET: "tigerretail-photos" })).toBe(
      "# settings\nSESSION_SECRET=x\nDATABASE_URL=postgresql://a\nS3_BUCKET=tigerretail-photos\n",
    );
  });
  it("quotes values with spaces or symbols", () => {
    expect(upsertEnv("", { MAIL_FROM: "TigerRetail <a@b.edu>" })).toBe('MAIL_FROM="TigerRetail <a@b.edu>"\n');
  });
});

it("masks secrets", () => {
  expect(masked("SG.abcdefghijkl")).toBe("SG.…•••• (15 chars)");
  expect(masked("short")).toBe("•••••");
});
