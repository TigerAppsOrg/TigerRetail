import { describe, expect, it } from "vitest";
import { bodySaleCandidate, buildingFromText, cleanContact, cleanNotes, pickPhotos, deckIdsIn, digestContact, fetchablePhotoUrl, linksIn, netidFromEmail, saleAuthor, parseSizeText, paymentsFrom, stripPhones, toDraft, type ExtractedItem } from "./rules";

const ID = "1lJc6xyZXj-xCubvaj6PwKh75p4RykmAaHnSPx0jTWeM";

describe("deckIdsIn", () => {
  it("finds slides links in every common shape, once each", () => {
    expect(
      deckIdsIn([
        `https://docs.google.com/presentation/d/${ID}/edit?usp=sharing`,
        `https://docs.google.com/presentation/u/0/d/${ID}/view`,
        "https://docs.google.com/presentation/d/AAAAAAAAAAAAAAAAAAAAAAAA/present",
        "https://docs.google.com/document/d/BBBBBBBBBBBBBBBBBBBBBBBB/edit",
        "https://lists.princeton.edu/cgi-bin/wa?SUBED1=BUTLERBUZZ",
        "not a url",
      ]),
    ).toEqual([ID, "AAAAAAAAAAAAAAAAAAAAAAAA"]);
  });
});

it("links pasted as plain text in the body count too (InboxEngine's links list misses them)", () => {
  const body = `Selling two bundles. link to slides: https://docs.google.com/presentation/d/${ID}/edit?usp=sharing\nText me!\nOpen Sale Slides [https://docs.google.com/presentation/d/AAAAAAAAAAAAAAAAAAAAAAAA/edit].`;
  expect(linksIn(body)).toEqual([`https://docs.google.com/presentation/d/${ID}/edit?usp=sharing`, "https://docs.google.com/presentation/d/AAAAAAAAAAAAAAAAAAAAAAAA/edit"]);
  expect(deckIdsIn(linksIn(body))).toEqual([ID, "AAAAAAAAAAAAAAAAAAAAAAAA"]);
  expect(linksIn("")).toEqual([]);
});

describe("digestContact (who posted a sale a HoagieMail digest relays)", () => {
  const digest = `🛍️ MARKETPLACE

Accessible anytime with stuff.hoagie.io/marketplace [https://stuff.hoagie.io/marketplace]
Open Sale Slides [https://docs.google.com/presentation/d/${ID}/edit?usp=sharing]

Selling mens clothing; jackets, quarter zips, hoodies!
Contact: Alex Kim (alexkim@princeton.edu)

Clothing

----------------------------------------

Open Sale Slides [https://docs.google.com/presentation/d/AAAAAAAAAAAAAAAAAAAAAAAA/edit]
Dorm stuff
From: Sam Q Ortiz (Sam.Ortiz@princeton.edu)

----------------------------------------

Open Sale Slides [https://docs.google.com/presentation/d/BBBBBBBBBBBBBBBBBBBBBBBB/edit]
no contact line here`;
  it("finds the contact in the entry that links the deck, with that entry's text", () => {
    const c = digestContact(digest, ID);
    expect(c).toMatchObject({ name: "Alex Kim", email: "alexkim@princeton.edu" });
    expect(c?.text).toContain("Selling mens clothing");
    expect(c?.text).not.toContain("Dorm stuff");
  });
  it("reads 'From:' lines and lowercases the address", () => {
    expect(digestContact(digest, "AAAAAAAAAAAAAAAAAAAAAAAA")).toMatchObject({ name: "Sam Q Ortiz", email: "sam.ortiz@princeton.edu" });
  });
  it("an entry without a contact, or a deck not in the digest, gives no author", () => {
    expect(digestContact(digest, "BBBBBBBBBBBBBBBBBBBBBBBB")).toMatchObject({ name: null, email: null });
    expect(digestContact(digest, "CCCCCCCCCCCCCCCCCCCCCCCC")).toBeNull();
  });
});

it("a digest's 'Hoagie Mail' relay is nobody; a real sender is kept", () => {
  expect(saleAuthor("Hoagie Mail", "")).toEqual({ name: null, email: null });
  expect(saleAuthor("Taylor M. Brooks", "TaylorBrooks@princeton.edu")).toEqual({ name: "Taylor M. Brooks", email: "taylorbrooks@princeton.edu" });
});

it("netid from a princeton address only", () => {
  expect(netidFromEmail("JMorgan@princeton.edu")).toBe("jmorgan");
  expect(netidFromEmail("someone@gmail.com")).toBeNull();
  expect(netidFromEmail(undefined)).toBeNull();
});

describe("stripPhones", () => {
  it.each([
    ["TEXT 609-555-0188", ""],
    ["venmo, paypal, cashapp preferred 2296300360", "venmo, paypal, cashapp preferred"],
    ["call (609) 555-0101 to pick up", "to pick up"],
    ["worn twice, size 8", "worn twice, size 8"],
  ])("%s → %s", (input, out) => expect(stripPhones(input)).toBe(out));
});

describe("parseSizeText (sizes as written on slides)", () => {
  it.each([
    ["xs-s", "clothing", "tops", "x-small–small", "x-small"],
    ["M", "clothing", "tops", "medium", "medium"],
    ["size xs", "clothing", "tops", "x-small", "x-small"],
    ["28x30", "clothing", "bottoms", "28 × 30", "28"],
    ["w32 l30", "clothing", "bottoms", "32 × 30", "32"],
    ["6", "clothing", "dresses/rompers", "6 (w)", "6 (w)"],
    ["8.5", "clothing", "shoes", "8.5 (w)", "8.5 (w)"],
    ["10 mens", "clothing", "shoes", "10 (m)", "10 (m)"],
    ["one size", "clothing", "bags & accessories", "one size", "one size"],
    ["", "dorm", "furniture", "n/a", "n/a"],
    ["fits like a 4/5", "clothing", "tops", "fits like a 4/5", "n/a"],
    // numbered ranges: the filter matches the first, like letter ranges
    ["0/2", "clothing", "bottoms", "0/2 (w)", "0 (w)"],
    ["4-6", "clothing", "dresses/rompers", "4/6 (w)", "4 (w)"],
    ["10/12", "clothing", "bottoms", "10/12 (w)", "10 (w)"],
    // a waist alone, on pants
    ["26", "clothing", "bottoms", "26 waist", "26"],
    ["w30", "clothing", "bottoms", "30 waist", "30"],
    ["22", "clothing", "bottoms", "22 waist", "22"],
    // "fits like" still says the size
    ["fits like xs", "clothing", "bottoms", "fits like x-small", "x-small"],
    ["fits like a 6", "clothing", "dresses/rompers", "fits like 6 (w)", "6 (w)"],
    // juniors' odd numbers aren't women's sizes: keep their words
    ["11", "clothing", "bottoms", "11", "n/a"],
    ["26", "clothing", "tops", "26", "n/a"],
  ])("%s (%s/%s) → %s", (raw, section, sub, label, facet) => {
    const r = parseSizeText(raw, section, sub, "women's");
    expect(r.size).toBe(label);
    expect(r.sizeFacet).toBe(facet);
  });
});

describe("toDraft", () => {
  const tank: ExtractedItem = {
    slide: 3,
    title: "polka dot tank top",
    price_dollars: 10,
    size: "xs-s",
    section: "clothing",
    sub: "tops",
    dept: "women's",
    condition: "not stated",
    sold: false,
    description: "",
    brand: null,
  };
  it("turns a slide item into a listing draft", () => {
    const r = toDraft(tank);
    expect(r).toMatchObject({ ok: true, draft: { title: "polka dot tank top", priceCents: 1000, section: "clothing", sub: "tops", dept: "women's", condition: "not stated" } });
    if (r.ok) expect(r.draft.size.size).toBe("x-small–small");
  });
  it("skips sold items, and items without a name or price", () => {
    expect(toDraft({ ...tank, sold: true })).toEqual({ ok: false, reason: "marked sold" });
    expect(toDraft({ ...tank, title: "  " })).toEqual({ ok: false, reason: "no name" });
    expect(toDraft({ ...tank, price_dollars: null })).toEqual({ ok: false, reason: "no price" });
    expect(toDraft({ ...tank, price_dollars: 0 })).toEqual({ ok: false, reason: "no price" });
  });
  it("guesses the category from the title when the slide's is unusable", () => {
    expect(toDraft({ ...tank, title: "Moving Bags", section: "boxes", sub: null, dept: null })).toMatchObject({
      ok: true,
      draft: { section: "dorm", sub: "essentials", dept: "misc" },
    });
    expect(toDraft({ ...tank, title: "Lulu Lemon Wallet", section: null, sub: null, dept: null })).toMatchObject({
      ok: true,
      draft: { section: "clothing", sub: "bags & accessories", dept: "unisex" },
    });
    expect(toDraft({ ...tank, title: "Extension Cord", section: null, sub: null })).toMatchObject({
      ok: true,
      draft: { section: "everything else", dept: "misc" },
    });
  });
  it("keeps the brand, lowercase like the brands people type", () => {
    expect(toDraft({ ...tank, brand: "  Brandy   Melville " })).toMatchObject({ ok: true, draft: { brand: "brandy melville" } });
    expect(toDraft({ ...tank, brand: null })).toMatchObject({ ok: true, draft: { brand: "" } });
    expect(toDraft({ ...tank, brand: "x".repeat(80) })).toMatchObject({ ok: true, draft: { brand: "x".repeat(60) } });
  });
  it("never keeps a phone number in the name or description", () => {
    const r = toDraft({ ...tank, title: "lamp text 609-555-0188", description: "call 609 555 0101" });
    expect(r.ok && r.draft.title).toBe("lamp");
    expect(r.ok && r.draft.description).toBe("");
  });
});

it("payments from slide text, with handles when given, unknown ones as other, cash if none", () => {
  expect(paymentsFrom([{ method: "venmo", handle: " @jamie-r " }, { method: "paypal", handle: null }, { method: "cashapp", handle: "$jamie" }])).toEqual([
    { id: "venmo", handle: "@jamie-r" },
    { id: "other", handle: "" },
  ]);
  expect(paymentsFrom([{ method: "zelle", handle: "609-555-0123" }])).toEqual([{ id: "zelle", handle: "609-555-0123" }]);
  expect(paymentsFrom([])).toEqual([{ id: "cash", handle: "" }]);
});

describe("cleanContact (how to reach the seller, from their own post)", () => {
  it("keeps a US phone as 10 digits, the email lowercase, pickup tidy", () => {
    expect(cleanContact({ phone: "Text me at (609) 555-0123!", email: " JR0001@Princeton.edu ", pickup: "  Yeh   College, Hariri Hall ", try_on: true }, null)).toEqual({
      phone: "6095550123",
      email: "jr0001@princeton.edu",
      pickup: "Yeh College, Hariri Hall",
      tryOn: true,
    });
    expect(cleanContact({ phone: "+1 609.555.0101", email: null, pickup: null, try_on: null }, null).phone).toBe("6095550101");
  });
  it("falls back to the address the email came from; drops what isn't a phone or email", () => {
    expect(cleanContact({ phone: "call me", email: "not an email", pickup: null, try_on: false }, "tiger1@princeton.edu")).toEqual({
      phone: null,
      email: "tiger1@princeton.edu",
      pickup: "",
      tryOn: false,
    });
    expect(cleanContact(null, null)).toEqual({ phone: null, email: "", pickup: "", tryOn: false });
  });
  it("keeps phone numbers out of the pickup text (they have their own field) and caps its length", () => {
    expect(cleanContact({ phone: null, email: null, pickup: "Whitman, text 609-555-0188 first", try_on: null }, null).pickup).toBe("Whitman, first");
    expect(cleanContact({ phone: null, email: null, pickup: "x".repeat(300), try_on: null }, null).pickup).toHaveLength(200);
  });
});

describe("bodySaleCandidate (emails worth reading for a sale written in the body)", () => {
  const photo = { kind: "image", url: "https://i.imgur.com/aYT9UnW.jpeg" };
  const sale = { senderEmail: "tiger2@princeton.edu", body: "$5 per item: projector, scale, yoga mat. Pickup at Yeh.", links: [], media: [photo, photo] };
  it("a priced post from a person, with photos", () => {
    expect(bodySaleCandidate(sale)).toEqual({ ok: true, photos: ["https://i.imgur.com/aYT9UnW.jpeg"] });
    expect(bodySaleCandidate({ ...sale, body: "selling my couch, 50 dollars obo" }).ok).toBe(true);
  });
  it("skips digests, deck emails, unpriced and text-only posts", () => {
    expect(bodySaleCandidate({ ...sale, senderEmail: "" })).toEqual({ ok: false, reason: "digest" });
    expect(bodySaleCandidate({ ...sale, body: `${sale.body} https://docs.google.com/presentation/d/${ID}/edit` })).toEqual({ ok: false, reason: "has slides" });
    expect(bodySaleCandidate({ ...sale, links: [`https://docs.google.com/presentation/d/${ID}/edit`] })).toEqual({ ok: false, reason: "has slides" });
    expect(bodySaleCandidate({ ...sale, body: "selling my desk, email me" })).toEqual({ ok: false, reason: "no price" });
    expect(bodySaleCandidate({ ...sale, media: [] })).toEqual({ ok: false, reason: "no photo" });
    expect(bodySaleCandidate({ ...sale, media: [{ kind: "video", url: "https://i.imgur.com/x.mp4" }] })).toEqual({ ok: false, reason: "no photo" });
  });
  it("keeps at most 10 photos", () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ kind: "image", url: `https://i.imgur.com/${i}.jpeg` }));
    const r = bodySaleCandidate({ ...sale, media: many });
    expect(r.ok && r.photos.length).toBe(10);
  });
});

it("only fetches photos from public https hosts", () => {
  expect(fetchablePhotoUrl("https://i.imgur.com/aYT9UnW.jpeg")).toBe(true);
  expect(fetchablePhotoUrl("https://media.discordapp.net/attachments/1/2/a.jpg?ex=1")).toBe(true);
  expect(fetchablePhotoUrl("http://i.imgur.com/a.jpeg")).toBe(false);
  expect(fetchablePhotoUrl("https://localhost:3000/a.jpg")).toBe(false);
  expect(fetchablePhotoUrl("https://127.0.0.1/a.jpg")).toBe(false);
  expect(fetchablePhotoUrl("https://[::1]/a.jpg")).toBe(false);
  expect(fetchablePhotoUrl("https://10.0.0.5/a.jpg")).toBe(false);
  expect(fetchablePhotoUrl("https://metadata.google.internal/a")).toBe(false);
  expect(fetchablePhotoUrl("not a url")).toBe(false);
});

it("seller notes: tidy, no phone numbers or emails, no repeats, at most 6", () => {
  expect(
    cleanNotes([
      "  Priority to people who   don't need try-ons ",
      "first come first served",
      "First come first served",
      "text 609-555-0188 to hold something",
      "questions? email abc@princeton.edu",
      "",
    ]),
  ).toEqual(["Priority to people who don't need try-ons", "first come first served", "to hold something", "questions?"]);
  expect(cleanNotes(Array.from({ length: 9 }, (_, i) => `note ${i}`))).toHaveLength(6);
  expect(cleanNotes(["x".repeat(300)])[0]).toHaveLength(160);
});

it("pickPhotos keeps the model's photo numbers only when they're real", () => {
  expect(pickPhotos([2, 2, 3], 3, 4)).toEqual([1, 2]);
  expect(pickPhotos([0, 4, 1.5, -1, 1], 3, 4)).toEqual([0]);
  expect(pickPhotos([1, 2, 3, 4, 5], 5, 4)).toEqual([0, 1, 2, 3]);
  expect(pickPhotos([], 3, 4)).toEqual([]);
});

describe("buildingFromText (a sale's pickup spot → a building the map can pin)", () => {
  const names = [
    "1976 Hall", "Wilf Hall", "Bloomberg Hall", "Fisher Hall Dorm", "Class of 1901-Laughlin Hall", "Class of 1903 Hall",
    "Hariri Hall", "Fu Hall", "Little Hall", "Brown Hall", "Buyers Hall", "Community Hall", "Walker Hall",
    "Forbes College Main", "Spelman Halls", "José E. Feliciano Hall", "Kwanza Jones Hall", "Alexander Street, 99", "Wendell Hall 'B'",
  ];
  it.each([
    ["Yeh College, Hariri Hall", "Hariri Hall"],
    ["pickup at wilf", "Wilf Hall"],
    ["Bloomberg 3rd floor", "Bloomberg Hall"],
    ["1901 Hall, room 214", "Class of 1901-Laughlin Hall"],
    ["Laughlin", "Class of 1901-Laughlin Hall"],
    ["1976", "1976 Hall"],
    ["fisher hall", "Fisher Hall Dorm"],
    ["Forbes, by the front desk", "Forbes College Main"],
    ["Spelman", "Spelman Halls"],
    ["Feliciano", "José E. Feliciano Hall"],
    ["kwanza jones", "Kwanza Jones Hall"],
    ["99 Alexander St", "Alexander Street, 99"],
    ["Wendell B", "Wendell Hall 'B'"],
    ["Little Hall basement", "Little Hall"],
    ["Fu Hall", "Fu Hall"],
  ])("%s → %s", (text, building) => expect(buildingFromText(text, names)).toBe(building));
  it.each([
    "Yeh College", // a college, not a building: a pin would be a guess
    "a little worn, brown leather", // everyday words aren't buildings
    "first come first served, buyers pick up",
    "community bulletin",
    "",
  ])("%s → nothing", (text) => expect(buildingFromText(text, names)).toBeNull());
  it("two buildings named: no pin rather than the wrong one", () => {
    expect(buildingFromText("Wilf or Bloomberg", names)).toBeNull();
  });
});
