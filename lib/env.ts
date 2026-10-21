import "server-only";

/* Fails loudly on a missing variable instead of running half-configured. */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}. Run bun run setup, or copy .env.example to .env.local and fill it in.`);
  return v;
}

export const env = {
  appUrl: () => required("APP_URL"),
  sessionSecret: () => required("SESSION_SECRET"),
  databaseUrl: () => required("DATABASE_URL"),
  s3: () => ({
    region: required("AWS_REGION"),
    bucket: required("S3_BUCKET"),
    publicUrl: required("S3_PUBLIC_URL").replace(/\/+$/, ""),
  }),
};
