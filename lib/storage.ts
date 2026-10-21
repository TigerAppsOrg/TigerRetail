import "server-only";
/* Photos, in Cloudflare R2 (S3-compatible). One bucket; each kind of photo
   under its own prefix, so a stored path like "rp4348/abc.jpg" lives at
   listing-photos/rp4348/abc.jpg and is served from R2_PUBLIC_URL. */
import { DeleteObjectsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

export const PHOTO_BUCKET = "listing-photos";
export const AVATAR_BUCKET = "avatars";
type Kind = typeof PHOTO_BUCKET | typeof AVATAR_BUCKET;

const g = globalThis as unknown as { __tigerretailR2?: S3Client };
function r2(): S3Client {
  const c = env.r2();
  g.__tigerretailR2 ??= new S3Client({
    region: "auto",
    endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  });
  return g.__tigerretailR2;
}

export const photoUrl = (path: string) => `${env.r2().publicUrl}/${PHOTO_BUCKET}/${path}`;
export const avatarUrl = (path: string) => `${env.r2().publicUrl}/${AVATAR_BUCKET}/${path}`;

export async function upload(kind: Kind, path: string, body: Uint8Array | ArrayBuffer | Buffer, contentType: string) {
  const bytes = body instanceof ArrayBuffer ? new Uint8Array(body) : body;
  await r2().send(new PutObjectCommand({ Bucket: env.r2().bucket, Key: `${kind}/${path}`, Body: bytes, ContentType: contentType }));
}

/* Deletes, 1000 at a time (the S3 limit). Throws if any didn't go. */
export async function remove(kind: Kind, paths: string[]) {
  for (let i = 0; i < paths.length; i += 1000) {
    const res = await r2().send(
      new DeleteObjectsCommand({ Bucket: env.r2().bucket, Delete: { Objects: paths.slice(i, i + 1000).map((p) => ({ Key: `${kind}/${p}` })), Quiet: true } }),
    );
    if (res.Errors?.length) throw new Error(`couldn't delete ${res.Errors.length} photos: ${res.Errors[0].Message}`);
  }
}
