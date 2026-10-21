/* Phone photos are 3–12 MP. Before upload, redraw each at most 1600px on
   its long side as a JPEG, which keeps a whole batch inside the Server
   Action body limit and makes the feed load fast. Throws if the browser
   can't decode the file (e.g. HEIC in Chrome) so the seller is told. */
export async function downscale(file: File, maxEdge = 1600): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`Couldn't read "${file.name}". Use a JPEG, PNG or WebP photo (iPhone: Settings → Camera → Formats → Most Compatible).`);
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare photos for upload.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.85));
  if (!blob) throw new Error(`Couldn't prepare "${file.name}" for upload.`);
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}
