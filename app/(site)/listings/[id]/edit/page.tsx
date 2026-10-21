import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { canEditListing, getListing } from "@/lib/data";
import { isAdmin } from "@/lib/importer/admin";
import { EditListing } from "./EditListing";

/* Edit a listing: its seller, or an admin fixing an import nobody has claimed. */
export default function EditListingPage({ params }: PageProps<"/listings/[id]/edit">) {
  return (
    <div className="wf">
      <div className="wrap" style={{ paddingTop: 24 }}>
        <Suspense fallback={<p className="sub">loading…</p>}>
          <Edit params={params} />
        </Suspense>
        <div style={{ height: 70 }} />
      </div>
    </div>
  );
}

async function Edit({ params }: { params: PageProps<"/listings/[id]/edit">["params"] }) {
  const { id } = await params;
  const user = await requireUser(`/listings/${id}/edit`, { onboarded: false });
  const l = await getListing(id);
  if (!l || !canEditListing(l, user.netid, isAdmin(user.netid))) notFound();
  return (
    <>
      <h1 className="q">edit listing</h1>
      <p className="q-sub">change anything, then save. photos: drag new ones in, remove any; the first is the cover.</p>
      <EditListing
        listing={{
          id: l.id,
          title: l.title,
          priceCents: l.priceCents,
          section: l.section,
          sub: l.sub,
          occasion: l.occasion,
          condition: l.condition,
          dept: l.dept,
          brand: l.brand,
          sizing: l.sizing,
          tryOn: l.tryOn,
          description: l.description,
          photos: l.photoPaths.map((path, i) => ({ path, url: l.photoUrls[i] })),
        }}
      />
    </>
  );
}
