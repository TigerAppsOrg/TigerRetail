import "server-only";
/* The TigerRetail Postgres database (DATABASE_URL), through postgres.js.
   Server-only: callers must already have checked the session.

   Timestamps come back as fixed-width UTC strings with microseconds, not Date
   objects (lib/pgTime): the app compares them as text (unread messages,
   "messages after this one"), and a Date would drop the microseconds. */
import postgres from "postgres";
import { env } from "./env";
import { pgTimestampToIso } from "./pgTime";

export type Sql = postgres.Sql<{ date: string }>;

const iso = {
  to: 1184,
  from: [1082, 1114, 1184],
  // strings go in as they are (a Date would round them to milliseconds)
  serialize: (x: Date | string) => (x instanceof Date ? x.toISOString() : String(x)),
  parse: pgTimestampToIso,
};

// one pool per server process (dev reloads modules: keep it on globalThis)
const g = globalThis as unknown as { __tigerretailSql?: Sql };
export function sql(): Sql {
  g.__tigerretailSql ??= postgres(env.databaseUrl(), {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
    connection: { TimeZone: "UTC" },
    types: { date: iso },
  }) as unknown as Sql;
  return g.__tigerretailSql;
}

export type Row = Record<string, unknown>;
