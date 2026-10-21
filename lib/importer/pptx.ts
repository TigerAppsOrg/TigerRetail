/* Photos and text per slide from a .pptx (Google Slides' PowerPoint export), pure.
   A .pptx is a zip of XML: presentation.xml lists the slides in order,
   each slide's .rels file maps r:embed ids to files under ppt/media/. */
import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";

export interface SlidePhoto {
  name: string; // file name inside the deck, e.g. image3.jpg
  type: string; // image/jpeg | image/png | image/webp | image/gif
  bytes: Uint8Array;
}

const MEDIA_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

const attr = (xml: string, re: RegExp) => [...xml.matchAll(re)].map((m) => m[1]);

/* rId → target path, resolved against the folder the .rels file describes */
function rels(files: Record<string, Uint8Array>, relsPath: string, baseDir: string): Map<string, string> {
  const xml = files[relsPath] ? strFromU8(files[relsPath]) : "";
  const out = new Map<string, string>();
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/\bId="([^"]+)"/)?.[1];
    const target = m[0].match(/\bTarget="([^"]+)"/)?.[1];
    if (!id || !target || /TargetMode="External"/.test(m[0])) continue;
    const parts = [...baseDir.split("/"), ...target.split("/")];
    const resolved: string[] = [];
    for (const p of parts) {
      if (p === "..") resolved.pop();
      else if (p && p !== ".") resolved.push(p);
    }
    out.set(id, resolved.join("/"));
  }
  return out;
}

/* each slide's file path, in presentation order (null if it's missing) */
function slidesInOrder(files: Record<string, Uint8Array>): (string | null)[] {
  const pres = files["ppt/presentation.xml"];
  if (!pres) throw new Error("Not a PowerPoint file (no ppt/presentation.xml).");
  const order = attr(strFromU8(pres), /<p:sldId\b[^>]*\br:id="([^"]+)"/g);
  const presRels = rels(files, "ppt/_rels/presentation.xml.rels", "ppt");
  return order.map((rid) => {
    const path = presRels.get(rid);
    return path && files[path] ? path : null;
  });
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescape = (t: string) =>
  t.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()],
  );

/* The words on each slide, in slide order: one line per paragraph. */
export function slideTexts(pptx: Uint8Array): string[] {
  const files = unzipSync(pptx);
  return slidesInOrder(files).map((path) => {
    if (!path) return "";
    return [...strFromU8(files[path]).matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)]
      .map((p) => attr(p[1], /<a:t>([^<]*)<\/a:t>/g).map(unescape).join("").trim())
      .filter(Boolean)
      .join("\n");
  });
}

/* Raster photos on each slide, in slide order (index 0 = slide 1), each in
   the order they appear on the slide. Vector art (emf/wmf/svg) is left out. */
export function photosBySlide(pptx: Uint8Array): SlidePhoto[][] {
  const files = unzipSync(pptx);
  return slidesInOrder(files).map((slidePath) => {
    if (!slidePath) return [];
    const name = slidePath.split("/").pop()!;
    const slideRels = rels(files, `ppt/slides/_rels/${name}.rels`, "ppt/slides");
    const embeds = attr(strFromU8(files[slidePath]), /r:embed="([^"]+)"/g);
    const seen = new Set<string>();
    const photos: SlidePhoto[] = [];
    for (const id of embeds) {
      const path = slideRels.get(id);
      if (!path || seen.has(path) || !files[path]) continue;
      seen.add(path);
      const ext = path.split(".").pop()!.toLowerCase();
      if (!MEDIA_TYPES[ext]) continue;
      photos.push({ name: path.split("/").pop()!, type: MEDIA_TYPES[ext], bytes: files[path] });
    }
    return photos;
  });
}

/* Template art (the deck theme's shapes, stickers, banners) repeats on slide
   after slide; item photos don't. An image whose bytes appear on `minSlides`
   or more slides is dropped. Decks too short to tell keep everything. */
export function withoutTemplateArt(slides: SlidePhoto[][], minSlides = 3): SlidePhoto[][] {
  if (slides.length < minSlides + 1) return slides;
  const hash = (p: SlidePhoto) => createHash("sha1").update(p.bytes).digest("hex");
  const onSlides = new Map<string, number>();
  for (const ph of slides) for (const h of new Set(ph.map(hash))) onSlides.set(h, (onSlides.get(h) ?? 0) + 1);
  return slides.map((ph) => ph.filter((p) => (onSlides.get(hash(p)) ?? 0) < minSlides));
}
