"use client";
/* Turns a listing photo into a map marker image: rounded frame (white = one
   item, orange = several), count badge, carousel dots and a tail pointing at
   the seller's dot. Drawn once per frame state on a canvas and cached; ArcGIS
   then draws it in the same pass as the dots, so it never lags behind them. */

export const MARKER = {
  w: 76, // canvas size in CSS px (drawn at 2x)
  h: 86,
  /* the tail tip is this far below the image centre; ArcGIS centres the image
     on the point, so lift it by this much plus a small gap above the dot */
  yoffset: 36 + 7,
  /* the frame's on-screen box, for decluttering: centre is this far above the dot */
  box: { w: 66, h: 74 },
  boxLift: 44,
};

const FRAME = { x: 6, y: 12, size: 58, r: 12, border: 3 };
const TIGER = "#BB4C19";

const images = new Map<string, Promise<HTMLImageElement>>();
function loadImage(url: string) {
  let p = images.get(url);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // real listing photos need CORS to be drawn
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Couldn't load listing photo ${url.slice(0, 80)}`));
      img.src = url;
    });
    p.catch(() => images.delete(url)); // allow a retry later
    images.set(url, p);
  }
  return p;
}

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

export interface MarkerFrame {
  imageUrl: string;
  count: number; // matching items this seller has
  shown: number; // which one the carousel is on
}

const cache = new Map<string, Promise<string>>();

export function photoMarker(f: MarkerFrame): Promise<string> {
  const key = `${f.imageUrl}|${f.count}|${f.shown}`;
  let p = cache.get(key);
  if (!p) {
    p = draw(f);
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

async function draw({ imageUrl, count, shown }: MarkerFrame): Promise<string> {
  const img = await loadImage(imageUrl);
  const S = 2;
  const canvas = document.createElement("canvas");
  canvas.width = MARKER.w * S;
  canvas.height = MARKER.h * S;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D isn't available to draw photo pins");
  ctx.scale(S, S);
  const multi = count > 1;
  const edge = multi ? TIGER : "#FFFFFF";
  const { x, y, size, r, border } = FRAME;
  const cx = x + size / 2;

  // tail + frame, with one shared shadow
  ctx.save();
  ctx.shadowColor = "rgba(23,21,15,0.30)";
  ctx.shadowBlur = 9;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = edge;
  ctx.beginPath();
  ctx.moveTo(cx - 8, y + size - 2);
  ctx.lineTo(cx + 8, y + size - 2);
  ctx.lineTo(cx, y + size + 9);
  ctx.closePath();
  ctx.fill();
  roundRect(ctx, x, y, size, size, r);
  ctx.fill();
  ctx.restore();

  // photo, cover-cropped into the frame
  ctx.save();
  roundRect(ctx, x + border, y + border, size - 2 * border, size - 2 * border, r - border);
  ctx.clip();
  const inner = size - 2 * border;
  const scale = Math.max(inner / img.naturalWidth, inner / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, x + border + (inner - dw) / 2, y + border + (inner - dh) / 2.6, dw, dh);
  ctx.restore();

  if (multi) {
    // carousel position dots
    const n = Math.min(count, 5);
    const step = 7;
    const start = cx - ((n - 1) * step) / 2;
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.arc(start + i * step, y + size - 8, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = i === shown % n ? "#FFFFFF" : "rgba(255,255,255,0.55)";
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 2;
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // count badge
    const label = String(count);
    ctx.font = "600 11px system-ui, -apple-system, sans-serif";
    const bw = Math.max(20, ctx.measureText(label).width + 10);
    const bx = x + size + 2 - bw / 2;
    const by = y - 2;
    ctx.fillStyle = TIGER;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2;
    roundRect(ctx, bx - bw / 2, by - 10, bw, 20, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, bx, by + 0.5);
  }

  return canvas.toDataURL("image/png");
}
