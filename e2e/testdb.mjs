/* Test and seed scripts' direct line to the TigerRetail database and the R2
   photo bucket (the app itself goes through lib/db and lib/storage). */
import { createRequire } from "node:module";
import postgres from "postgres";

process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
const { S3Client, PutObjectCommand, DeleteObjectsCommand } = createRequire(import.meta.url)("@aws-sdk/client-s3");

// timestamps as plain text both ways, like the app
const text = { to: 1184, from: [1082, 1114, 1184], serialize: (x) => (x instanceof Date ? x.toISOString() : String(x)), parse: (x) => x };
export const db = postgres(process.env.DATABASE_URL, { max: 3, onnotice: () => {}, types: { date: text }, connection: { TimeZone: "UTC" } });

let columnTypes = null;
/* Insert one row or many; JSON and array columns are encoded from the
   database's own column types. Returns the inserted rows. */
export async function insert(table, rowOrRows) {
  columnTypes ??= new Map(
    (await db`select table_name, column_name, data_type from information_schema.columns where table_schema = 'public'`).map((c) => [`${c.table_name}.${c.column_name}`, c.data_type]),
  );
  const rows = (Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows]).map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => {
        const t = columnTypes.get(`${table}.${k}`);
        if (!t) throw new Error(`${table}.${k} isn't a column`);
        if (v === null || v === undefined) return [k, null];
        if (t === "jsonb" || t === "json") return [k, db.json(v)];
        if (t === "ARRAY") return [k, db.array(v)];
        return [k, v];
      }),
    ),
  );
  return db`insert into ${db(table)} ${db(rows)} returning *`;
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
export const photoUrl = (bucket, path) => `${process.env.R2_PUBLIC_URL.replace(/\/+$/, "")}/${bucket}/${path}`;
export async function putPhoto(bucket, path, bytes, contentType) {
  await r2.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: `${bucket}/${path}`, Body: bytes, ContentType: contentType }));
}
export async function removePhotos(bucket, paths) {
  for (let i = 0; i < paths.length; i += 1000) {
    await r2.send(new DeleteObjectsCommand({ Bucket: process.env.R2_BUCKET, Delete: { Objects: paths.slice(i, i + 1000).map((p) => ({ Key: `${bucket}/${p}` })), Quiet: true } }));
  }
}
