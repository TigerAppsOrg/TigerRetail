/* npm run migrate: apply db/migrations/*.sql to DATABASE_URL, in name order,
   each once, each in its own transaction. Applied ones are recorded in
   schema_migrations. --status lists them without changing anything. */
import { readdirSync, readFileSync } from "node:fs";
import postgres from "postgres";

process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL isn't set (npm run setup).");
const dir = new URL("../db/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });

try {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
  const todo = files.filter((f) => !done.has(f));
  if (process.argv.includes("--status")) {
    for (const f of files) console.log(`${done.has(f) ? "applied" : "pending"}  ${f}`);
  } else {
    for (const f of todo) {
      const body = readFileSync(new URL(f, dir), "utf8");
      // no parameters: postgres.js sends it as one simple query, so a file can hold many statements
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name) values (${f})`;
      });
      console.log(`applied  ${f}`);
    }
    console.log(todo.length ? `${todo.length} applied.` : "Up to date.");
  }
} catch (e) {
  console.error(`Stopped: ${e.message}${e.position ? ` (at character ${e.position})` : ""}. That file's changes were rolled back.`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
