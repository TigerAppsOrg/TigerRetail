"use client";
/* Selling, photos first:
     1 photos + details   drop photos (each becomes an item card), name, price,
                          category; everything else is optional and folded away.
                          How buyers reach you is one summary line, from
                          onboarding, with "change".
     2 live               what just went up
   Everything stays here until "publish", then goes to the server in one
   Server Action. The same pure rules (lib/rules) check the form here for
   instant feedback and again on the server. */
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ALPHA_SIZES,
  APPAREL,
  APPAREL_DEPTS,
  CONDITIONS,
  FITS,
  LENGTHS,
  NUM_SIZES,
  OCCASIONS,
  SECTIONS,
  SHOE_SCALES,
  SHOE_SIZES,
  WAISTS,
  blankSizing,
  defaultSystem,
  guessCategory,
  subsOf,
  type SizeSystem,
  type Sizing,
} from "@/lib/catalog";
import type { Section } from "@/components/campus-map/types";
import { MAX_PHOTOS, formatPhone, isBlankItem, parseContact, parseDollars, parseItem, type ContactChoice, type ItemDraft } from "@/lib/rules";
import { publishBatchAction } from "../actions";
import { downscale } from "../_components/downscale";
import { Icon } from "../_components/Icon";
import { ListingCard, type CardListing } from "../_components/ListingCard";
import { PayEditor } from "../_components/PayEditor";

/* a photo on an item card: a new file, or (editing) one already stored at `path` */
export interface Photo {
  key: string;
  file?: File;
  path?: string;
  url: string;
}
export interface Item {
  key: string;
  title: string;
  price: string;
  section: Section;
  sub: string;
  categoryTouched: boolean; // once the seller picks a category, stop guessing
  guessedFrom: string | null;
  occasion: string;
  condition: string;
  dept: string;
  brand: string;
  sizing: Sizing;
  tryOn: boolean;
  desc: string;
  photos: Photo[];
  showDetails: boolean;
}

let seq = 0;
export const nextKey = () => `k${++seq}`;
const blankItem = (photos: Photo[] = []): Item => ({
  key: nextKey(),
  title: "",
  price: "",
  section: "clothing",
  sub: "tops",
  categoryTouched: false,
  guessedFrom: null,
  occasion: "none",
  condition: "like new",
  dept: "unisex", // the wireframe's default when it doesn't know your department
  brand: "",
  sizing: blankSizing(defaultSystem("clothing", "tops")),
  tryOn: false,
  desc: "",
  photos,
  showDetails: false,
});
export const draftOf = (it: Item): ItemDraft => ({
  title: it.title,
  price: it.price,
  section: it.section,
  sub: it.sub,
  occasion: it.occasion,
  condition: it.condition,
  dept: it.dept,
  brand: it.brand,
  sizing: it.sizing,
  tryOn: it.tryOn,
  desc: it.desc,
  photoCount: it.photos.length,
});
const priceOk = (p: string) => (parseDollars(p) ?? 0) > 0;
/* errors on fields that live under "add details" open it */
const DETAIL_FIELDS = ["occasion", "condition", "dept", "brand", "desc"];

/* turn picked/dropped files into downscaled photos; problems are reported, not swallowed */
async function toPhotos(files: File[], track: (url: string) => void): Promise<{ photos: Photo[]; problems: string[] }> {
  const photos: Photo[] = [];
  const problems: string[] = [];
  for (const f of files) {
    try {
      const file = await downscale(f);
      const url = URL.createObjectURL(file);
      track(url);
      photos.push({ key: nextKey(), file, url });
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { photos, problems };
}
const imagesIn = (list: FileList | null | undefined) => Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || f.name === "");

export interface SellDefaults {
  email: string;
  phone: string | null;
  payments: { id: string; handle: string }[];
  building: string | null;
}

export function SellFlow({ defaults }: { defaults: SellDefaults }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [contact, setContact] = useState<ContactChoice>({
    emailMode: "default",
    altEmail: "",
    phoneMode: defaults.phone ? "default" : "none",
    altPhone: "",
    pickup: "",
    payments: defaults.payments,
  });
  const [editContact, setEditContact] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [itemErrors, setItemErrors] = useState<Record<string, Record<string, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [published, setPublished] = useState<CardListing[]>([]);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // object URLs for previews are freed when the flow goes away
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const live = urls.current;
    return () => live.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  const track = (u: string) => urls.current.add(u);

  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((it) => (it.key === key ? { ...it, ...p } : it)));

  /* the drop zone: every photo starts its own item card */
  const newItemsFrom = async (files: File[]) => {
    if (!files.length) return;
    setDropError(null);
    setAdding(true);
    const { photos, problems } = await toPhotos(files, track);
    setAdding(false);
    if (problems.length) setDropError(problems.join(" "));
    setItems((xs) => [...xs, ...photos.map((p) => blankItem([p]))]);
  };

  const filled = items.filter((it) => !isBlankItem(draftOf(it)));
  const ready = items.some((it) => it.title.trim() && priceOk(it.price) && it.photos.length > 0);

  const publish = () => {
    setFormError(null);
    const c = parseContact(contact, defaults);
    setContactErrors(c.ok ? {} : c.errors);
    if (!c.ok) setEditContact(true);
    const errs: Record<string, Record<string, string>> = {};
    for (const it of filled) {
      const r = parseItem(draftOf(it));
      if (!r.ok) errs[it.key] = r.errors;
    }
    setItemErrors(errs);
    setItems((xs) => xs.map((it) => (errs[it.key] && DETAIL_FIELDS.some((f) => errs[it.key][f]) ? { ...it, showDetails: true } : it)));
    if (!c.ok || Object.keys(errs).length) {
      setFormError(!c.ok ? "Something in how buyers reach you needs fixing." : "Fix the highlighted items, then publish again.");
      return;
    }
    const fd = new FormData();
    fd.set("contact", JSON.stringify(contact));
    fd.set("items", JSON.stringify(filled.map(draftOf)));
    filled.forEach((it, i) => it.photos.forEach((p) => p.file && fd.append(`photos:${i}`, p.file)));
    startTransition(async () => {
      const res = await publishBatchAction(fd);
      if (res.ok) {
        setPublished(res.listings);
        setStep(2);
        window.scrollTo({ top: 0, behavior: "instant" });
        return;
      }
      if (res.contactErrors) {
        setContactErrors(res.contactErrors);
        setEditContact(true);
      }
      const byKey: Record<string, Record<string, string>> = {};
      for (const [i, e] of Object.entries(res.itemErrors ?? {})) byKey[filled[Number(i)].key] = e;
      setItemErrors(byKey);
      setFormError(res.form ?? (res.contactErrors ? "Something in how buyers reach you needs fixing." : "Fix the highlighted items, then publish again."));
    });
  };

  if (step === 2) {
    return (
      <div className="wrap">
        <StepBar n={2} />
        <div style={{ display: "grid", placeItems: "center", padding: "30px 0 10px" }}>
          <div className="btn btn-outline" style={{ cursor: "default", gap: 10, padding: "14px 26px", fontSize: 17 }}>
            <Icon name="party" /> congrats! your listing{published.length > 1 ? "s are" : " is"} now live.
          </div>
        </div>
        <p className="sub" style={{ textAlign: "center", margin: "14px auto 0" }}>
          {published.length} item{published.length === 1 ? "" : "s"} in this batch.
        </p>
        {published.length > 0 && (
          <div className="grid" style={{ maxWidth: 760, margin: "26px auto 0" }}>
            {published.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", padding: "34px 0 20px", flexWrap: "wrap" }}>
          <button
            className="btn btn-primary"
            onClick={() => {
              setItems([]);
              setItemErrors({});
              setPublished([]);
              setStep(1);
              window.scrollTo({ top: 0, behavior: "instant" });
            }}
          >
            <Icon name="plus" /> sell more
          </button>
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", padding: "0 0 80px", flexWrap: "wrap" }}>
          <Link className="btn btn-ghost" href="/me">
            see my listings
          </Link>
          <Link className="btn btn-ghost" href="/">
            back to browsing
          </Link>
        </div>
      </div>
    );
  }

  const payList = contact.payments.map((p) => p.id).join(" · ") || "no payment method";
  const phone = contact.phoneMode === "none" ? null : contact.phoneMode === "alt" ? contact.altPhone : defaults.phone ? formatPhone(defaults.phone) : null;
  const email = contact.emailMode === "alt" ? contact.altEmail : defaults.email;
  const pickup = contact.pickup.trim() || (defaults.building ? `pickup at ${defaults.building}` : "");

  return (
    <div className="wrap">
      <StepBar n={1} />
      <h1 className="q">what are you selling?</h1>
      <p className="q-sub">start with photos &mdash; one item or a whole pile. name, price and category are all you need.</p>
      {formError && (
        <div className="errbox" role="alert" style={{ maxWidth: 640, margin: "0 auto 18px" }}>
          {formError}
        </div>
      )}

      {items.map((it, idx) => (
        <ItemEditor
          key={it.key}
          item={it}
          idx={idx}
          errors={itemErrors[it.key]}
          patch={(p) => patch(it.key, p)}
          remove={() => setItems((xs) => xs.filter((x) => x.key !== it.key))}
          track={track}
        />
      ))}

      <div
        className={`drop ${dragOver ? "over" : ""} ${items.length ? "small" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          newItemsFrom(imagesIn(e.dataTransfer.files));
        }}
      >
        <Icon name="up" />
        <b>{adding ? "adding photos…" : items.length ? "add another item — drop or tap for photos" : "drop photos here or tap to pick them"}</b>
        <span className="sub" style={{ color: "inherit", margin: 0 }}>
          each photo becomes an item card; drop more onto a card for extra angles
        </span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        aria-label="photos for new items"
        onChange={(e) => {
          newItemsFrom(imagesIn(e.target.files));
          e.target.value = "";
        }}
      />
      {dropError && <p className="err">{dropError}</p>}
      {items.length === 0 && (
        <p className="sub" style={{ textAlign: "center", margin: "12px auto 0" }}>
          no photos yet?{" "}
          <button className="link-act" onClick={() => setItems([blankItem()])}>
            start a card without one
          </button>
        </p>
      )}

      <div className="footbar" style={{ flexDirection: "column", alignItems: "stretch", gap: 14 }}>
        {editContact ? (
          <div className="contactbox">
            <ContactEditor contact={contact} setContact={setContact} defaults={defaults} errors={contactErrors} />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className="btn btn-outline"
                onClick={() => {
                  const r = parseContact(contact, defaults);
                  setContactErrors(r.ok ? {} : r.errors);
                  if (r.ok) setEditContact(false);
                }}
              >
                done
              </button>
            </div>
          </div>
        ) : (
          <div className="contactline">
            <span>
              buyers reach you at <b>{email}</b>
              {phone ? ` · ${phone}` : ""} · {payList}
              {pickup ? ` · ${pickup}` : ""}
            </span>
            <button className="link-act" onClick={() => setEditContact(true)}>
              change
            </button>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14 }}>
          {!ready && items.length > 0 && <span className="sub" style={{ margin: 0 }}>give an item a photo, a name and a price above $0 to publish.</span>}
          <button className="btn btn-primary" disabled={!ready || pending} onClick={publish}>
            {pending ? "publishing…" : `publish listing${filled.length > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function StepBar({ n }: { n: number }) {
  const names = ["photos + details", "live"];
  return (
    <div className="steps" style={{ justifyContent: "center" }}>
      {names.map((nm, i) => {
        const k = i + 1;
        return (
          <div key={nm} style={{ display: "contents" }}>
            <div className={`step ${k === n ? "on" : ""} ${k < n ? "done" : ""}`}>
              <i>{k < n ? "✓" : k}</i>
              {nm}
            </div>
            {i < names.length - 1 && <div className="step-sep" />}
          </div>
        );
      })}
    </div>
  );
}

/* How buyers reach you about this batch. Starts from onboarding; changes here
   apply to these listings only (payment methods also become your default). */
function ContactEditor({
  contact: c,
  setContact,
  defaults,
  errors,
}: {
  contact: ContactChoice;
  setContact: (c: ContactChoice) => void;
  defaults: SellDefaults;
  errors: Record<string, string>;
}) {
  const set = (p: Partial<ContactChoice>) => setContact({ ...c, ...p });
  return (
    <>
      <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>how buyers reach you about these listings</h3>
      <div className="two">
        <div className="blk">
          <h3>email</h3>
          <label className="opt">
            <input type="radio" name="em" checked={c.emailMode === "default"} onChange={() => set({ emailMode: "default" })} />
            <span className="opt-l">
              <span>use my default</span>
              <span className="strong">{defaults.email}</span>
            </span>
          </label>
          <label className="opt">
            <input type="radio" name="em" checked={c.emailMode === "alt"} onChange={() => set({ emailMode: "alt" })} />
            <span className="opt-l">
              <span>use a different email</span>
            </span>
          </label>
          {c.emailMode === "alt" && (
            <input className="inp" type="email" value={c.altEmail} placeholder="you@princeton.edu" aria-label="different email" onChange={(e) => set({ altEmail: e.target.value })} />
          )}
          {errors.email && <p className="err">{errors.email}</p>}
        </div>
        <div className="blk">
          <h3>phone number</h3>
          {defaults.phone && (
            <label className="opt">
              <input type="radio" name="ph" checked={c.phoneMode === "default"} onChange={() => set({ phoneMode: "default" })} />
              <span className="opt-l">
                <span>use my default</span>
                <span className="strong">{formatPhone(defaults.phone)}</span>
              </span>
              <Link className="opt-r" href="/profile">
                change default
              </Link>
            </label>
          )}
          <label className="opt">
            <input type="radio" name="ph" checked={c.phoneMode === "alt"} onChange={() => set({ phoneMode: "alt" })} />
            <span className="opt-l">
              <span>use a different number</span>
            </span>
          </label>
          {c.phoneMode === "alt" && (
            <input className="inp" type="tel" value={c.altPhone} placeholder="555-555-5555" aria-label="different phone number" onChange={(e) => set({ altPhone: e.target.value })} />
          )}
          <label className="opt">
            <input type="radio" name="ph" checked={c.phoneMode === "none"} onChange={() => set({ phoneMode: "none" })} />
            <span className="opt-l">
              <span>don&rsquo;t use my number</span>
            </span>
          </label>
          {errors.phone && <p className="err">{errors.phone}</p>}
        </div>
      </div>
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>pickup/try-on instructions</h3>
        <textarea
          className="inp"
          value={c.pickup}
          aria-label="pickup and try-on instructions"
          placeholder={`e.g. ${defaults.building ? defaults.building.toLowerCase() : "forbes college"}, i can meet at the entrance most evenings`}
          onChange={(e) => set({ pickup: e.target.value })}
        />
        {errors.pickup && <p className="err">{errors.pickup}</p>}
      </div>
      <div style={{ maxWidth: 540 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>payment methods you take</h3>
        <PayEditor value={c.payments} onChange={(payments) => set({ payments })} />
        {errors.payments && <p className="err">{errors.payments}</p>}
        <p className="sub" style={{ marginTop: 8, fontSize: 12.5 }}>
          whatever you tick here is saved as your default for next time.
        </p>
      </div>
    </>
  );
}

const opts = (list: readonly string[]) =>
  list.map((v) => (
    <option key={v} value={v}>
      {v}
    </option>
  ));

export function ItemEditor({
  item: it,
  idx,
  errors = {},
  patch,
  remove,
  track,
}: {
  item: Item;
  idx: number;
  errors?: Record<string, string>;
  patch: (p: Partial<Item>) => void;
  remove?: () => void; // no "remove" when editing a single listing
  track: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [over, setOver] = useState(false);
  const apparel = APPAREL.has(it.section);

  const category = (section: Section, sub: string, touched: boolean, guessedFrom: string | null = null) =>
    patch({
      section,
      sub,
      categoryTouched: touched,
      guessedFrom,
      sizing: blankSizing(defaultSystem(section, sub, it.title)),
      tryOn: APPAREL.has(section) ? it.tryOn : false,
    });

  /* naming the item guesses its category until the seller picks one */
  const setTitle = (title: string) => {
    const g = it.categoryTouched ? null : guessCategory(title);
    if (g && (g.section !== it.section || g.sub !== it.sub)) {
      // a different category: its size controls start fresh
      patch({ title, section: g.section, sub: g.sub, guessedFrom: g.word, sizing: blankSizing(defaultSystem(g.section, g.sub, title)), tryOn: APPAREL.has(g.section) ? it.tryOn : false });
    } else if (g) {
      patch({ title, guessedFrom: g.word }); // same category: keep the size already picked
    } else if (!it.categoryTouched) {
      patch({ title, guessedFrom: null });
    } else {
      patch({ title });
    }
  };

  const addPhotos = async (files: File[]) => {
    if (!files.length) return;
    setPhotoError(null);
    setAdding(true);
    const room = MAX_PHOTOS - it.photos.length;
    const { photos, problems } = await toPhotos(files.slice(0, room), track);
    if (files.length > room) problems.push(`Up to ${MAX_PHOTOS} photos per item.`);
    setAdding(false);
    if (problems.length) setPhotoError(problems.join(" "));
    patch({ photos: [...it.photos, ...photos] });
  };

  const z = it.sizing;
  const sz = (p: Partial<Sizing>) => patch({ sizing: { ...z, ...p } });
  const swap = (system: SizeSystem) => patch({ sizing: { ...z, system } });
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div
      className={`itemcard ${hasErrors ? "bad" : ""} ${over ? "over" : ""}`}
      data-item={idx}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        addPhotos(imagesIn(e.dataTransfer.files));
      }}
    >
      <div className="itemhead">
        <span className="n">{idx + 1}</span>
        <span>{it.title.trim() || "new item"}</span>
        {remove && (
          <button className="rm" onClick={remove}>
            remove
          </button>
        )}
      </div>
      <div className="gal">
        <div className="galgrid">
          {it.photos.map((p, pi) => (
            <div key={p.key} className={`shot ${pi === 0 ? "cover" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview of a not-yet-uploaded file */}
              <img src={p.url} alt="" />
              {pi === 0 && <span className="covertag">cover</span>}
              <div className="shot-tools">
                <button title="remove" aria-label="remove photo" onClick={() => patch({ photos: it.photos.filter((x) => x.key !== p.key) })}>
                  <Icon name="trash" />
                </button>
              </div>
            </div>
          ))}
          {it.photos.length < MAX_PHOTOS && (
            <button className="addshot" onClick={() => fileRef.current?.click()} disabled={adding}>
              <Icon name="up" />
              <span>{adding ? "adding…" : "add photo"}</span>
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          aria-label={`photos for item ${idx + 1}`}
          onChange={(e) => {
            addPhotos(imagesIn(e.target.files));
            e.target.value = "";
          }}
        />
        <p className="galnote">{it.photos.length ? "first photo is the cover buyers see." : "add at least one photo."}</p>
        {(photoError || errors.photos) && <p className="err">{photoError ?? errors.photos}</p>}
      </div>
      <div className="itembody">
        <input
          className={`titleline ${it.title.trim() ? "" : "needed"}`}
          value={it.title}
          placeholder="what is it?"
          aria-label="item name"
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
        />
        {errors.title && <p className="err">{errors.title}</p>}
        <div className="priceline">
          <span>$</span>
          <input
            className={priceOk(it.price) ? "" : "needed"}
            value={it.price}
            inputMode="decimal"
            placeholder="how much?"
            aria-label="price"
            onChange={(e) => patch({ price: e.target.value })}
          />
          {!priceOk(it.price) && <span className="reqnote">name and price are required</span>}
        </div>
        {errors.price && <p className="err">{errors.price}</p>}
        <div className="fieldgrid">
          <div className="frow">
            <label>category</label>
            <select aria-label="category" value={it.section} onChange={(e) => category(e.target.value as Section, subsOf(e.target.value)[0], true)}>
              {opts(SECTIONS.map(([s]) => s))}
            </select>
            <select aria-label="subcategory" value={it.sub} onChange={(e) => category(it.section, e.target.value, true)}>
              {opts(subsOf(it.section))}
            </select>
          </div>
          {z.system === "shoe" && (
            <div className="frow">
              <label>shoe size</label>
              <select aria-label="shoe size" value={z.shoe} style={{ maxWidth: 86 }} onChange={(e) => sz({ shoe: e.target.value })}>
                {opts(SHOE_SIZES)}
              </select>
              <select aria-label="shoe scale" value={z.scale} style={{ maxWidth: 110 }} onChange={(e) => sz({ scale: e.target.value })}>
                {opts(SHOE_SCALES)}
              </select>
            </div>
          )}
          {z.system === "waist" && (
            <div className="frow">
              <label>size</label>
              <select aria-label="waist" value={z.waist} style={{ maxWidth: 74 }} onChange={(e) => sz({ waist: e.target.value })}>
                {opts(WAISTS)}
              </select>
              <span className="muted">×</span>
              <select aria-label="length" value={z.length} style={{ maxWidth: 74 }} onChange={(e) => sz({ length: e.target.value })}>
                {opts(LENGTHS)}
              </select>
              <select aria-label="fit" value={z.fit} style={{ maxWidth: 110 }} onChange={(e) => sz({ fit: e.target.value })}>
                {opts(FITS)}
              </select>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 6px" }} onClick={() => swap("alpha")}>
                use s/m/l
              </button>
            </div>
          )}
          {z.system === "alpha" && (
            <div className="frow">
              <label>size</label>
              <select aria-label="size" value={z.alpha} onChange={(e) => sz({ alpha: e.target.value })}>
                {opts([...ALPHA_SIZES, ...NUM_SIZES])}
              </select>
              {it.sub === "bottoms" && (
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 6px" }} onClick={() => swap("waist")}>
                  use waist × length
                </button>
              )}
            </div>
          )}
        </div>
        {it.guessedFrom && !it.categoryTouched && (
          <p className="guess">
            ✓ {z.system === "waist" ? "category and waist × length" : "category"} guessed from &ldquo;{it.guessedFrom}&rdquo; &mdash; change it if it&rsquo;s wrong
          </p>
        )}
        {(errors.section || errors.sub || errors.size) && <p className="err">{[errors.section, errors.sub, errors.size].filter(Boolean).join(" ")}</p>}

        <button className="more-details" aria-expanded={it.showDetails} onClick={() => patch({ showDetails: !it.showDetails })}>
          <span style={{ display: "inline-flex", transform: it.showDetails ? "rotate(180deg)" : undefined }}>
            <Icon name="down" />
          </span>
          {it.showDetails ? "hide details" : `add details (optional) — condition, brand, occasion${apparel ? ", department, try-on" : ""}, description`}
        </button>
        {it.showDetails && (
          <div style={{ marginTop: 12 }}>
            <div className="fieldgrid">
              <div className="frow">
                <label>condition</label>
                <select aria-label="condition" value={it.condition} onChange={(e) => patch({ condition: e.target.value })}>
                  {/* an imported item can be "not stated" until its seller says */}
                  {opts(it.condition === "not stated" ? ["not stated", ...CONDITIONS] : CONDITIONS)}
                </select>
              </div>
              <div className="frow">
                <label>occasion</label>
                <select aria-label="occasion" value={it.occasion} onChange={(e) => patch({ occasion: e.target.value })}>
                  {opts(OCCASIONS)}
                </select>
              </div>
              {apparel && (
                <div className="frow">
                  <label>department</label>
                  <select aria-label="department" value={it.dept} onChange={(e) => patch({ dept: e.target.value })}>
                    {opts(APPAREL_DEPTS)}
                  </select>
                </div>
              )}
              <div className="frow" style={{ alignItems: "flex-start" }}>
                <label style={{ paddingTop: 4 }}>brand</label>
                <div className="brandwrap">
                  <input type="text" value={it.brand} placeholder="start typing…" aria-label="brand" maxLength={60} onChange={(e) => patch({ brand: e.target.value })} />
                </div>
              </div>
              {apparel && (
                <div className="frow">
                  <label>allow try-on requests</label>
                  <button
                    className={`sw ${it.tryOn ? "on" : ""}`}
                    role="switch"
                    aria-checked={it.tryOn}
                    aria-label="allow try-on requests"
                    onClick={() => patch({ tryOn: !it.tryOn })}
                  />
                </div>
              )}
            </div>
            {(errors.condition || errors.occasion || errors.dept || errors.brand) && (
              <p className="err">{[errors.condition, errors.occasion, errors.dept, errors.brand].filter(Boolean).join(" ")}</p>
            )}
            <textarea className="inp" value={it.desc} placeholder="add a description" aria-label="description" maxLength={2000} onChange={(e) => patch({ desc: e.target.value })} />
            {errors.desc && <p className="err">{errors.desc}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
