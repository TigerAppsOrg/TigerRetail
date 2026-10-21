"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Section } from "@/components/campus-map/types";
import type { Sizing } from "@/lib/catalog";
import { updateListingAction } from "../../../actions";
import { draftOf, ItemEditor, nextKey, type Item } from "../../../sell/SellFlow";

export interface Editable {
  id: string;
  title: string;
  priceCents: number;
  section: Section;
  sub: string;
  occasion: string;
  condition: string;
  dept: string;
  brand: string;
  sizing: Sizing;
  tryOn: boolean;
  description: string;
  photos: { path: string; url: string }[];
}

const dollars = (cents: number) => (cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100));

/* The sell form's item card, filled in with the listing; save sends the
   details and the photos in their new order (stored ones by path, new files
   uploaded). A size the seller doesn't touch is kept as stored. */
export function EditListing({ listing }: { listing: Editable }) {
  const router = useRouter();
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);
  const [item, setItem] = useState<Item>(() => ({
    key: nextKey(),
    title: listing.title,
    price: dollars(listing.priceCents),
    section: listing.section,
    sub: listing.sub,
    categoryTouched: true, // it has a category: don't guess one from the name
    guessedFrom: null,
    occasion: listing.occasion,
    condition: listing.condition,
    dept: listing.dept === "misc" ? "unisex" : listing.dept,
    brand: listing.brand,
    sizing: listing.sizing,
    tryOn: listing.tryOn,
    desc: listing.description,
    photos: listing.photos.map((p) => ({ key: nextKey(), path: p.path, url: p.url })),
    showDetails: true,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setFormError(null);
    const fd = new FormData();
    fd.append("listingId", listing.id);
    fd.append("item", JSON.stringify(draftOf(item)));
    fd.append("sizingChanged", item.sizing === listing.sizing ? "0" : "1");
    const order: ({ path: string } | { new: number })[] = [];
    let n = 0;
    for (const p of item.photos) {
      if (p.path) order.push({ path: p.path });
      else if (p.file) {
        order.push({ new: n++ });
        fd.append("new", p.file);
      }
    }
    fd.append("order", JSON.stringify(order));
    const r = await updateListingAction(fd);
    setSaving(false);
    if (r.ok) {
      router.push(`/listings/${listing.id}`);
      router.refresh();
      return;
    }
    setErrors(r.errors ?? {});
    setFormError(r.form ?? "Fix the highlighted fields.");
  }

  return (
    <>
      {formError && (
        <div className="errbox" role="alert" style={{ maxWidth: 640, margin: "0 auto 18px" }}>
          {formError}
        </div>
      )}
      <ItemEditor
        item={item}
        idx={0}
        errors={errors}
        patch={(p) => setItem((it) => ({ ...it, ...p }))}
        track={(u) => previews.current.push(u)}
      />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", maxWidth: 760, margin: "14px auto 0" }}>
        <Link className="btn btn-ghost" href={`/listings/${listing.id}`}>
          cancel
        </Link>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "saving…" : "save changes"}
        </button>
      </div>
    </>
  );
}
