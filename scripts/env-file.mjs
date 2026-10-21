/* Pure helpers for `bun run setup` (scripts/setup-env.mjs): build the database
   URL from its parts, and set keys in an env file without duplicating them. */

/* postgresql://user:pass@host:5432/db?sslmode=require: the user, password and
   database name are percent-encoded, so a password with @ : / # ? % works */
export function databaseUrl({ host, port, database, username, password, ssl }) {
  for (const [k, v] of Object.entries({ host, database, username, password })) {
    if (!String(v ?? "").trim()) throw new Error(`${k} can't be empty`);
  }
  const h = host.trim().replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "");
  const p = String(port ?? "").trim() || "5432";
  if (!/^\d{1,5}$/.test(p)) throw new Error(`port must be a number, like 5432 (got "${p}")`);
  const enc = encodeURIComponent;
  return `postgresql://${enc(username.trim())}:${enc(password)}@${h}:${p}/${enc(database.trim())}${ssl ? "?sslmode=require" : ""}`;
}

/* Set KEY=value lines in env-file text: replace the key where it is, else
   append; everything else (comments, other keys) stays as it was. */
export function upsertEnv(text, values) {
  const lines = text.split("\n");
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${/[\s#"'`$\\]/.test(value) ? JSON.stringify(value) : value}`;
    const i = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (i >= 0) lines[i] = line;
    else {
      if (lines.length && lines[lines.length - 1] === "") lines.splice(lines.length - 1, 0, line);
      else lines.push(line);
    }
  }
  const out = lines.join("\n");
  return out.endsWith("\n") ? out : `${out}\n`;
}

/* what to show for a value: secrets never in full */
export const masked = (v) => (v.length <= 8 ? "•".repeat(v.length) : `${v.slice(0, 3)}…${"•".repeat(4)} (${v.length} chars)`);
