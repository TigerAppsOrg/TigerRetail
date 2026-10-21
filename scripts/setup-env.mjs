/* bun run setup: asks for the team database and S3 settings one at
   a time (secrets hidden as you type) and saves them to .env.local. Nothing is
   written until the end, and secrets are never printed back. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { connect } from "node:net";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { databaseUrl, masked, upsertEnv } from "./env-file.mjs";

const ENV_FILE = process.env.ENV_FILE ?? new URL("../.env.local", import.meta.url).pathname;

// one reader for the whole run; hidden answers aren't echoed
let muted = false;
const out = new Writable({
  write(chunk, enc, cb) {
    if (!muted) process.stdout.write(chunk, enc);
    cb();
  },
});
const rl = createInterface({ input: process.stdin, output: out, terminal: Boolean(process.stdin.isTTY) });
const lines = rl[Symbol.asyncIterator]();

async function ask(question, { hidden = false, def = "" } = {}) {
  process.stdout.write(`${question}${def ? ` [${def}]` : ""}${hidden ? " (hidden as you type)" : ""}: `);
  muted = hidden;
  const { value, done } = await lines.next();
  muted = false;
  if (hidden || !process.stdin.isTTY) process.stdout.write("\n");
  if (done) throw new Error("input ended before every question was answered");
  return value.trim() || def;
}
const yes = async (question, def = true) => /^y/i.test(await ask(`${question} (${def ? "Y/n" : "y/N"})`, { def: def ? "y" : "n" }));

/* can we reach the database server at all? (doesn't log in) */
const reachable = (host, port) =>
  new Promise((resolve) => {
    const s = connect({ host, port: Number(port), timeout: 6000 }, () => {
      s.destroy();
      resolve(true);
    });
    s.on("timeout", () => (s.destroy(), resolve(false)));
    s.on("error", () => resolve(false));
  });

async function database() {
  console.log("\n— the TigerRetail database —");
  if (await yes("Do you have the whole database URL (starts with postgres:// or postgresql://)?", false)) {
    let url = await ask("Paste the database URL", { hidden: true });
    if (!/^postgres(ql)?:\/\/.+@.+/.test(url)) throw new Error("That doesn't look like a database URL (postgresql://user:password@host:port/database).");
    if (!/sslmode=/.test(url) && (await yes("Use SSL (most hosted databases need it)?"))) url += `${url.includes("?") ? "&" : "?"}sslmode=require`;
    const u = new URL(url.replace(/^postgres(ql)?:/, "http:"));
    return { url, host: u.hostname, port: u.port || "5432" };
  }
  const host = await ask("Host (e.g. db.example.com)");
  const port = await ask("Port", { def: "5432" });
  const database = await ask("Database name");
  const username = await ask("Username");
  const password = await ask("Password", { hidden: true });
  const ssl = await yes("Use SSL (most hosted databases need it)?");
  return { url: databaseUrl({ host, port, database, username, password, ssl }), host: host.replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, ""), port };
}

async function s3() {
  console.log("\n— AWS S3 (photos) —");
  console.log("Ask TigerApps for the bucket, CloudFront URL, and an AWS profile with photo access.");
  console.log("Use aws sso login --profile <profile> before running the app. EC2 uses its instance role.");
  const region = await ask("AWS region", { def: "us-east-1" });
  const bucket = await ask("S3 bucket name");
  const publicUrl = (await ask("CloudFront public URL (https://…cloudfront.net)")).replace(/\/+$/, "");
  const profile = await ask("Local AWS profile (leave blank to use the default credential chain)");
  if (!bucket) throw new Error("The S3 bucket name is required.");
  if (!/^https:\/\//.test(publicUrl)) throw new Error("The public image URL should start with https://");
  return { AWS_REGION: region, S3_BUCKET: bucket, S3_PUBLIC_URL: publicUrl, AWS_PROFILE: profile };
}

try {
  console.log(`Saves settings to ${ENV_FILE}. Nothing is written until the end; press Ctrl C to stop at any time.`);
  const values = {};
  if (await yes("\nSet up the TigerRetail database?")) {
    const db = await database();
    process.stdout.write(`Checking ${db.host}:${db.port} is reachable… `);
    console.log((await reachable(db.host, db.port)) ? "yes." : "no answer (wrong host/port, a firewall, or you need to be on Princeton's network or VPN). Saving it anyway.");
    values.DATABASE_URL = db.url;
  }
  if (await yes("\nSet up AWS S3 for photos?")) Object.assign(values, await s3());
  if (!Object.keys(values).length) {
    console.log("\nNothing to save.");
  } else {
    const before = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
    writeFileSync(ENV_FILE, upsertEnv(before, values), { mode: 0o600 });
    console.log(`\nSaved to ${ENV_FILE}:`);
    for (const [k, v] of Object.entries(values)) {
      const secret = /SECRET|KEY_ID|DATABASE_URL/.test(k);
      console.log(`  ${k} = ${secret ? masked(v) : v}`);
    }
    console.log("\nRestart the dev server (Ctrl C, then bun run dev) so it picks these up.");
  }
} catch (e) {
  console.error(`\nStopped: ${e instanceof Error ? e.message : e}\nNothing was saved.`);
  process.exitCode = 1;
} finally {
  rl.close();
}
