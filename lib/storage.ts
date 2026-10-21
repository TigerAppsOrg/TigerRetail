import "server-only";
/* Photos in a private S3 bucket, served through CloudFront. One bucket; each kind of photo
   under its own prefix, so a stored path like "rp4348/abc.jpg" lives at
   listing-photos/rp4348/abc.jpg and is served from S3_PUBLIC_URL. */
import { DeleteObjectsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

export const PHOTO_BUCKET = "listing-photos";
export const AVATAR_BUCKET = "avatars";
type Kind = typeof PHOTO_BUCKET | typeof AVATAR_BUCKET;

const g = globalThis as unknown as { __tigerretailS3?: S3Client };
function s3(): S3Client {
  const c = env.s3();
  g.__tigerretailS3 ??= new S3Client({
    region: c.region,
    // Default credential chain: EC2 instance role in production, AWS_PROFILE
    // (including SSO) locally. Never embed long-lived AWS keys in the app.
  });
  return g.__tigerretailS3;
}

export const photoUrl = (path: string) => `${env.s3().publicUrl}/${PHOTO_BUCKET}/${path}`;
export const avatarUrl = (path: string) => `${env.s3().publicUrl}/${AVATAR_BUCKET}/${path}`;

export async function upload(kind: Kind, path: string, body: Uint8Array | ArrayBuffer | Buffer, contentType: string) {
  const bytes = body instanceof ArrayBuffer ? new Uint8Array(body) : body;
  await s3().send(new PutObjectCommand({ Bucket: env.s3().bucket, Key: `${kind}/${path}`, Body: bytes, ContentType: contentType }));
}

/* Deletes, 1000 at a time (the S3 limit). Throws if any didn't go. */
export async function remove(kind: Kind, paths: string[]) {
  for (let i = 0; i < paths.length; i += 1000) {
    const res = await s3().send(
      new DeleteObjectsCommand({ Bucket: env.s3().bucket, Delete: { Objects: paths.slice(i, i + 1000).map((p) => ({ Key: `${kind}/${p}` })), Quiet: true } }),
    );
    if (res.Errors?.length) throw new Error(`couldn't delete ${res.Errors.length} photos: ${res.Errors[0].Message}`);
  }
}
