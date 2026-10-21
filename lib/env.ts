import "server-only";

/* Fails loudly on a missing variable instead of running half-configured. */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}. Run npm run setup, or copy .env.example to .env.local and fill it in.`);
  return v;
}

export const env = {
  appUrl: () => required("APP_URL"),
  sessionSecret: () => required("SESSION_SECRET"),
  databaseUrl: () => required("DATABASE_URL"),
  r2: () => ({
    accountId: required("R2_ACCOUNT_ID"),
    bucket: required("R2_BUCKET"),
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    publicUrl: required("R2_PUBLIC_URL").replace(/\/+$/, ""),
  }),
};
