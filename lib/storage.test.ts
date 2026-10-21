import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { send, clientOptions } = vi.hoisted(() => ({ send: vi.fn(), clientOptions: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@aws-sdk/client-s3", async (original) => {
  const sdk = await original<typeof import("@aws-sdk/client-s3")>();
  return {
    ...sdk,
    S3Client: class {
      constructor(options: unknown) { clientOptions(options); }
      send = send;
    },
  };
});
import { avatarUrl, photoUrl, remove, upload, PHOTO_BUCKET, AVATAR_BUCKET } from "./storage";
import { env } from "./env";

beforeEach(() => {
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("S3_BUCKET", "test-photos");
  vi.stubEnv("S3_PUBLIC_URL", "https://images.example.com///");
  delete (globalThis as { __tigerretailS3?: unknown }).__tigerretailS3;
  send.mockReset().mockResolvedValue({});
  clientOptions.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("S3 photo storage", () => {
  it("keeps existing database paths under their photo and avatar prefixes", () => {
    expect(photoUrl("rp4348/old.jpg")).toBe("https://images.example.com/listing-photos/rp4348/old.jpg");
    expect(avatarUrl("rp4348/avatar.png")).toBe("https://images.example.com/avatars/rp4348/avatar.png");
  });

  it("uploads bytes and content type using the default AWS credential chain", async () => {
    const body = new Uint8Array([1, 2, 3]);
    await upload(PHOTO_BUCKET, "rp4348/photo.jpg", body.buffer, "image/jpeg");
    expect(clientOptions).toHaveBeenCalledWith({ region: "us-east-1" });
    expect(send.mock.calls[0][0].input).toEqual({ Bucket: "test-photos", Key: "listing-photos/rp4348/photo.jpg", Body: body, ContentType: "image/jpeg" });
  });

  it("splits large deletes into valid S3 batches", async () => {
    const paths = Array.from({ length: 1001 }, (_, i) => `user/${i}.jpg`);
    await remove(AVATAR_BUCKET, paths);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0].input.Delete.Objects).toHaveLength(1000);
    expect(send.mock.calls[1][0].input).toEqual({ Bucket: "test-photos", Delete: { Objects: [{ Key: "avatars/user/1000.jpg" }], Quiet: true } });
  });

  it("does not silently accept partial deletion failures", async () => {
    send.mockResolvedValue({ Errors: [{ Key: "listing-photos/user/a.jpg", Message: "Access denied" }] });
    await expect(remove(PHOTO_BUCKET, ["user/a.jpg"])).rejects.toThrow("Access denied");
  });

  it("requires S3 config even when legacy R2 settings exist", () => {
    vi.stubEnv("R2_BUCKET", "old-bucket");
    vi.stubEnv("S3_BUCKET", "");
    expect(() => env.s3()).toThrow("Missing env var S3_BUCKET");
  });
});
