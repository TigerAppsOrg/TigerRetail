import { connection } from "next/server";
import { sql } from "@/lib/db";
import { env } from "@/lib/env";

export async function GET() {
  await connection();
  try {
    env.appUrl();
    env.sessionSecret();
    env.s3();
    await sql()`select 1`;
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
