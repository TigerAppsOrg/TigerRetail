import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { photosBySlide, slideTexts, withoutTemplateArt, type SlidePhoto } from "./pptx";

/* A minimal deck: slide files are named out of order on purpose (Google
   numbers them by creation, presentation.xml decides the order). */
function deck() {
  const rel = (id: string, target: string, external = false) =>
    `<Relationship Id="${id}" Type="x" Target="${target}"${external ? ' TargetMode="External"' : ""}/>`;
  const relsXml = (...r: string[]) => `<Relationships>${r.join("")}</Relationships>`;
  const slide = (...embeds: string[]) => `<p:sld>${embeds.map((e) => `<a:blip r:embed="${e}"/>`).join("")}</p:sld>`;
  return zipSync({
    "ppt/presentation.xml": strToU8(`<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId7"/><p:sldId id="257" r:id="rId5"/><p:sldId id="258" r:id="rId6"/></p:sldIdLst></p:presentation>`),
    "ppt/_rels/presentation.xml.rels": strToU8(relsXml(rel("rId5", "slides/slide2.xml"), rel("rId6", "slides/slide3.xml"), rel("rId7", "slides/slide1.xml"))),
    // slide1: title slide, no photos
    "ppt/slides/slide1.xml": strToU8(slide()),
    // slide2: two photos plus a vector logo and an external link
    "ppt/slides/slide2.xml": strToU8(slide("rId2", "rId3", "rId4", "rId2")),
    "ppt/slides/_rels/slide2.xml.rels": strToU8(relsXml(rel("rId2", "../media/image1.jpg"), rel("rId3", "../media/image2.png"), rel("rId4", "../media/logo.emf"), rel("rId9", "https://x", true))),
    // slide3: one photo
    "ppt/slides/slide3.xml": strToU8(slide("rId2")),
    "ppt/slides/_rels/slide3.xml.rels": strToU8(relsXml(rel("rId2", "../media/image3.jpeg"))),
    "ppt/media/image1.jpg": new Uint8Array([1]),
    "ppt/media/image2.png": new Uint8Array([2]),
    "ppt/media/image3.jpeg": new Uint8Array([3]),
    "ppt/media/logo.emf": new Uint8Array([4]),
  });
}

describe("photosBySlide", () => {
  it("follows presentation order, keeps raster photos in on-slide order, drops vectors and repeats", () => {
    const slides = photosBySlide(deck());
    expect(slides.map((s) => s.map((p) => p.name))).toEqual([[], ["image1.jpg", "image2.png"], ["image3.jpeg"]]);
    expect(slides[1][1]).toMatchObject({ type: "image/png", bytes: new Uint8Array([2]) });
  });
  it("rejects something that isn't a deck", () => {
    expect(() => photosBySlide(zipSync({ "a.txt": strToU8("hi") }))).toThrow(/Not a PowerPoint/);
  });
});

describe("slideTexts", () => {
  it("reads each slide's words in presentation order, a line per paragraph, entities decoded", () => {
    const para = (...runs: string[]) => `<a:p>${runs.map((r) => `<a:r><a:t>${r}</a:t></a:r>`).join("")}</a:p>`;
    const pptx = zipSync({
      "ppt/presentation.xml": strToU8(`<p:presentation><p:sldIdLst><p:sldId r:id="rId2"/><p:sldId r:id="rId1"/></p:sldIdLst></p:presentation>`),
      "ppt/_rels/presentation.xml.rels": strToU8(`<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>`),
      "ppt/slides/slide1.xml": strToU8(`<p:sld>${para("polka dot tank ", "$10")}${para("xs&amp;s")}<a:p/></p:sld>`),
      "ppt/slides/slide2.xml": strToU8(`<p:sld>${para("SENIOR SALE")}${para("text 609-555-0123 &#8212; venmo @jamie")}</p:sld>`),
    });
    expect(slideTexts(pptx)).toEqual(["SENIOR SALE\ntext 609-555-0123 \u2014 venmo @jamie", "polka dot tank $10\nxs&s"]);
  });
});

describe("withoutTemplateArt", () => {
  const img = (name: string, byte: number): SlidePhoto => ({ name, type: "image/png", bytes: new Uint8Array([byte, byte]) });
  const star = (n: number) => img(`star${n}.png`, 9); // the theme's starfish: same bytes, a new file on every slide
  it("drops images repeated on 3+ slides, keeps each slide's own photos", () => {
    const deck = [[star(1), img("tank.png", 1)], [star(2), img("cami.png", 2)], [star(3), img("lamp.png", 3), img("lamp2.png", 4)], [img("cover.png", 5)]];
    expect(withoutTemplateArt(deck).map((s) => s.map((p) => p.name))).toEqual([["tank.png"], ["cami.png"], ["lamp.png", "lamp2.png"], ["cover.png"]]);
  });
  it("an item photographed on two slides stays", () => {
    const deck = [[img("a.png", 1)], [img("a-again.png", 1)], [img("b.png", 2)], [img("c.png", 3)]];
    expect(withoutTemplateArt(deck).flat()).toHaveLength(4);
  });
  it("leaves short decks alone", () => {
    const deck = [[star(1)], [star(2)], [star(3)]];
    expect(withoutTemplateArt(deck).flat()).toHaveLength(3);
  });
});
