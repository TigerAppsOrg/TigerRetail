import { describe, expect, it } from "vitest";
import {
  buyerSeesSellerContact,
  formatCents,
  isBlankItem,
  normalizePhone,
  offerBlocker,
  parseContact,
  parseDollars,
  parseItem,
  parsePayments,
  refreshListingContact,
  parseProfile,
  personLabel,
  initials,
  respondBlocker,
  type ContactChoice,
  type ItemDraft,
} from "./rules";

const form = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

describe("parseDollars", () => {
  it.each([
    ["12", 1200],
    ["12.5", 1250],
    ["$12.50", 1250],
    [" 0 ", 0],
    ["12.505", null],
    ["-3", null],
    ["abc", null],
    ["", null],
  ])("%s → %s", (input, out) => expect(parseDollars(input)).toBe(out));
});

it("formatCents drops .00", () => {
  expect(formatCents(1500)).toBe("$15");
  expect(formatCents(1550)).toBe("$15.50");
});

it("normalizePhone", () => {
  expect(normalizePhone("+1 (609) 555-0123")).toBe("6095550123");
  expect(normalizePhone("555")).toBeNull();
});

describe("parsePayments", () => {
  it("keeps known methods in catalog order with handles", () => {
    expect(parsePayments([{ id: "venmo", handle: " @tiger " }, { id: "cash", handle: "" }, { id: "bitcoin", handle: "x" }])).toEqual({
      ok: true,
      value: [{ id: "venmo", handle: "@tiger" }, { id: "cash", handle: "" }],
    });
  });
  it("needs at least one", () => expect(parsePayments([])).toMatchObject({ ok: false, errors: { payments: expect.any(String) } }));
  it("needs a handle where buyers have to send money", () => {
    expect(parsePayments([{ id: "venmo", handle: "" }, { id: "zelle", handle: "" }])).toEqual({
      ok: false,
      errors: { payments: "Add zelle and venmo details so buyers know where to send it." },
    });
  });
});

describe("parseProfile", () => {
  it("reads phone, ticked payments with handles, building", () => {
    const r = parseProfile(form([["phone", "609 555 0123"], ["pay", "venmo"], ["handle:venmo", "@rp"], ["handle:zelle", "ignored"], ["building", "1976 Hall"]]));
    expect(r).toEqual({ ok: true, value: { phone: "6095550123", payments: [{ id: "venmo", handle: "@rp" }], building: "1976 Hall", roomDirections: "" } });
  });
  it("requires phone, payment and building", () => {
    const r = parseProfile(form([["phone", "555"]]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["building", "payments", "phone"]);
  });
});

describe("parseContact (sell step 1)", () => {
  const defaults = { email: "rp1@princeton.edu", phone: "6095550101" };
  const base: ContactChoice = { emailMode: "default", altEmail: "", phoneMode: "default", altPhone: "", pickup: " forbes ", payments: [{ id: "cash", handle: "" }] };
  it("defaults come from the account", () => {
    expect(parseContact(base, defaults)).toEqual({ ok: true, value: { email: "rp1@princeton.edu", phone: "6095550101", pickup: "forbes", payments: [{ id: "cash", handle: "" }] } });
  });
  it("a listing can use a different email and number", () => {
    const r = parseContact({ ...base, emailMode: "alt", altEmail: "Me@Gmail.com", phoneMode: "alt", altPhone: "(212) 555-0000" }, defaults);
    expect(r).toMatchObject({ ok: true, value: { email: "me@gmail.com", phone: "2125550000" } });
  });
  it("don't use my number → no phone on the listing", () => {
    expect(parseContact({ ...base, phoneMode: "none" }, defaults)).toMatchObject({ ok: true, value: { phone: null } });
  });
  it("rejects a bad alternate email or phone", () => {
    const r = parseContact({ ...base, emailMode: "alt", altEmail: "nope", phoneMode: "alt", altPhone: "12" }, defaults);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["email", "phone"]);
  });
});

describe("parseItem (sell step 2)", () => {
  const jeans: ItemDraft = {
    title: " levi's 501 ",
    price: "25",
    section: "clothing",
    sub: "bottoms",
    occasion: "none",
    condition: "like new",
    dept: "men's",
    brand: "levi's",
    sizing: { system: "waist", waist: "32", length: "30", fit: "straight" },
    tryOn: true,
    desc: "barely worn",
    photoCount: 2,
  };
  it("accepts a complete apparel item and derives its size strings", () => {
    const r = parseItem(jeans);
    expect(r).toMatchObject({
      ok: true,
      value: { title: "levi's 501", priceCents: 2500, dept: "men's", size: "32 × 30 · straight", sizeFacet: "32", tryOn: true, description: "barely worn" },
    });
  });
  it("non-apparel is misc, never try-on, size n/a", () => {
    const r = parseItem({ ...jeans, section: "dorm", sub: "furniture", dept: "women's", tryOn: true, sizing: { system: "na" } });
    expect(r).toMatchObject({ ok: true, value: { dept: "misc", tryOn: false, size: "n/a" } });
  });
  it("price must be above $0 (wireframe rule)", () => {
    expect(parseItem({ ...jeans, price: "0" })).toMatchObject({ ok: false, errors: { price: expect.any(String) } });
  });
  it("needs a photo, a real size and a department for apparel", () => {
    const r = parseItem({ ...jeans, photoCount: 0, dept: "", sizing: { system: "shoe", shoe: "9", scale: "men's" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["dept", "photos", "size"]);
  });
  it("editing keeps a stored size the seller didn't touch, even one the picker can't make", () => {
    const keep = { sizing: { system: "waist", waist: "26", length: "", fit: "" }, size: "26 waist", sizeFacet: "26" };
    const r = parseItem({ ...jeans, sizing: keep.sizing }, { keepSize: keep });
    expect(r).toMatchObject({ ok: true, value: { size: "26 waist", sizeFacet: "26", sizing: keep.sizing } });
    // without keepSize the same half-filled sizing is refused
    expect(parseItem({ ...jeans, sizing: keep.sizing })).toMatchObject({ ok: false, errors: { size: expect.any(String) } });
  });
  it("editing an imported item can keep condition 'not stated'; the sell form can't pick it", () => {
    expect(parseItem({ ...jeans, condition: "not stated" }, { allowNotStated: true })).toMatchObject({ ok: true, value: { condition: "not stated" } });
    expect(parseItem({ ...jeans, condition: "not stated" })).toMatchObject({ ok: false, errors: { condition: expect.any(String) } });
  });
  it("a card with nothing in it is blank and gets skipped", () => {
    expect(isBlankItem({ ...jeans, title: "", price: "", photoCount: 0 })).toBe(true);
    expect(isBlankItem({ ...jeans, title: "", price: "", photoCount: 1 })).toBe(false);
  });
});

describe("offer rules", () => {
  const listing = { sellerNetid: "seller", status: "active" as const };
  it("sellers can't offer on their own item", () => expect(offerBlocker(listing, "seller")).toMatch(/your listing/));
  it("nobody can offer on a sold item", () => expect(offerBlocker({ ...listing, status: "sold" }, "buyer")).toMatch(/sold/));
  it("buyers can offer on an active item", () => expect(offerBlocker(listing, "buyer")).toBeNull());

  it("only the seller responds", () => expect(respondBlocker(listing, { status: "pending" }, "buyer")).toMatch(/Only the seller/));
  it("can't respond twice", () => expect(respondBlocker(listing, { status: "accepted" }, "seller")).toMatch(/already accepted/));
  it("seller responds to a pending offer", () => expect(respondBlocker(listing, { status: "pending" }, "seller")).toBeNull());

  it("buyer sees seller contact only once their own offer is accepted", () => {
    const offers = [
      { buyerNetid: "a", status: "accepted" as const },
      { buyerNetid: "b", status: "pending" as const },
    ];
    expect(buyerSeesSellerContact("a", offers)).toBe(true);
    expect(buyerSeesSellerContact("b", offers)).toBe(false);
    expect(buyerSeesSellerContact("c", offers)).toBe(false);
  });
});

describe("profile: about you", () => {
  it("labels a person by name, falling back to the netid", () => {
    expect(personLabel({ netid: "rp4348", displayName: "Raj P." })).toBe("Raj P.");
    expect(personLabel({ netid: "rp4348", displayName: " " })).toBe("rp4348");
    expect(personLabel({ netid: "rp4348" })).toBe("rp4348");
  });
  it("initials from the name, else the netid", () => {
    expect(initials({ netid: "rp4348", displayName: "raj patel" })).toBe("RP");
    expect(initials({ netid: "rp4348" })).toBe("R");
  });

  const base: [string, string][] = [["phone", "6095550123"], ["pay", "cash"], ["building", "1976 Hall"]];
  it("onboarding (no about fields) leaves name and bio alone", () => {
    const r = parseProfile(form(base));
    expect(r.ok && r.value.about).toBeUndefined();
  });
  it("the profile page saves name and bio, blanks as null", () => {
    const r = parseProfile(form([...base, ["displayName", " Raj P. "], ["bio", ""]]));
    expect(r).toMatchObject({ ok: true, value: { about: { displayName: "Raj P.", bio: null } } });
  });
  it("rejects an overlong name and bio", () => {
    const r = parseProfile(form([...base, ["displayName", "x".repeat(41)], ["bio", "x".repeat(161)]]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["bio", "displayName"]);
  });
});

describe("refreshListingContact (profile edits reach live listings)", () => {
  const profile = { phone: "6095550199", payments: [{ id: "venmo" as const, handle: "@new" }, { id: "cash" as const, handle: "" }] };
  it("a listing on the old default phone and handle gets the new ones", () => {
    expect(refreshListingContact({ phone: "6095550101", payments: [{ id: "venmo", handle: "@old" }] }, "6095550101", profile)).toEqual({
      phone: "6095550199",
      payments: [{ id: "venmo", handle: "@new" }],
    });
  });
  it("a listing with its own number, or none, keeps it", () => {
    expect(refreshListingContact({ phone: "2125550000", payments: profile.payments }, "6095550101", profile).phone).toBe("2125550000");
    expect(refreshListingContact({ phone: null, payments: profile.payments }, "6095550101", profile).phone).toBeNull();
  });
  it("a method taken off the profile comes off the listing", () => {
    const r = refreshListingContact({ phone: null, payments: [{ id: "zelle", handle: "x" }, { id: "cash", handle: "" }] }, null, profile);
    expect(r.payments).toEqual([{ id: "cash", handle: "" }]);
  });
  it("…but a listing is never left with no way to pay", () => {
    const r = refreshListingContact({ phone: null, payments: [{ id: "zelle", handle: "x" }] }, null, profile);
    expect(r.payments).toEqual(profile.payments);
  });
});
