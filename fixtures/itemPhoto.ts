/* Placeholder "photos" for demo listings: a flat illustration per section,
   drawn as an SVG data URI so the prototype needs no image hosting. Real
   listings pass real photo URLs. */
import type { Section } from "@/components/campus-map/types";

const PALETTES = [
  ["#F4E3D3", "#BB4C19"], ["#E3ECE4", "#3F7D52"], ["#E2E8F3", "#2F6DB5"], ["#F3E1EA", "#C2417A"],
  ["#EFEADF", "#6B6555"], ["#F6EBD2", "#986D22"], ["#E6E1F0", "#5B4B8A"], ["#DDEDEE", "#2C7A80"],
];

const GLYPH: Record<Section, string> = {
  clothing: "M70 60 50 72l10 22 10-6v72h60V88l10 6 10-22-20-12c-6 10-16 14-30 14S76 70 70 60z",
  accessories: "M62 90h76l-8 80H70zM80 90c0-24 40-24 40 0",
  "special occasions": "M84 50h32l-6 30 30 90H60l30-90z",
  dorm: "M60 120h80v40H60zM66 160v18M134 160v18M70 120V90h60v30",
  "school supplies": "M58 64h56v112H58zM114 64h28v112h-28M70 84h32M70 100h32",
  "everything else": "M60 96h80v76H60zM54 80h92v16H54zM100 80v92M100 80c-10-26-40-16-24 0M100 80c10-26 40-16 24 0",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

export function itemPhoto(title: string, section: Section, seed: number): string {
  const [bg, ink] = PALETTES[Math.abs(seed) % PALETTES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 250">
<rect width="200" height="250" fill="${bg}"/>
<ellipse cx="100" cy="196" rx="58" ry="8" fill="${ink}" opacity=".15"/>
<path d="${GLYPH[section]}" fill="${ink}" fill-opacity=".28" stroke="${ink}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
<text x="100" y="230" font-family="Poppins,Helvetica,sans-serif" font-size="15" font-weight="600" fill="${ink}" text-anchor="middle">${esc(title.slice(0, 22))}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
