import "server-only";
import https from "node:https";

/* Deck exports and email photos are downloaded with node:https, not fetch.
   In dev, Next's patched fetch keeps a base64 copy of every response body for
   its fetch cache; a 207 MB deck turned into a ~280 MB string and ran the
   server out of memory. This streams, follows redirects (Google's exports
   redirect), stops past maxBytes, and can vet every hop with `allow`. */
export interface Download {
  status: number;
  type: string;
  bytes: Buffer;
  url: string; // after redirects
}

export function download(
  url: string,
  opts: { maxBytes: number; timeoutMs?: number; allow?: (url: string) => boolean; redirects?: number },
): Promise<Download> {
  const { maxBytes, timeoutMs = 180_000, allow = () => true, redirects = 5 } = opts;
  return new Promise((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return reject(new Error(`not a URL: ${url}`));
    }
    if (u.protocol !== "https:" || !allow(url)) return reject(new Error(`won't download ${u.host}`));
    const req = https.get(u, { headers: { "user-agent": "tigerretail/1.0" } }, (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location) {
        res.resume();
        if (redirects <= 0) return reject(new Error("too many redirects"));
        return download(new URL(location, u).href, { ...opts, redirects: redirects - 1 }).then(resolve, reject);
      }
      const declared = Number(res.headers["content-length"] ?? 0);
      if (declared > maxBytes) {
        res.destroy();
        return reject(new Error(`${Math.round(declared / 1e6)} MB is over the ${Math.round(maxBytes / 1e6)} MB limit`));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > maxBytes) {
          res.destroy();
          reject(new Error(`over the ${Math.round(maxBytes / 1e6)} MB limit`));
        } else chunks.push(c);
      });
      res.on("end", () => resolve({ status, type: String(res.headers["content-type"] ?? ""), bytes: Buffer.concat(chunks, size), url: u.href }));
      res.on("error", reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timed out after ${Math.round(timeoutMs / 1000)}s`)));
    req.on("error", reject);
  });
}
