import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { formatPhone, personLabel } from "@/lib/rules";
import { isAdmin } from "@/lib/importer/admin";
import { ProfileForm } from "../_components/ProfileForm";
import { AvatarEditor } from "./AvatarEditor";

/* Your profile (PRD #6, plus how you show up to others). Private: only you see
   this page. Name and photo appear next to your listings and
   offers; phone, handles and room directions only reach a buyer whose offer
   you accept. */
export default function ProfilePage({ searchParams }: PageProps<"/profile">) {
  return (
    <div className="wf">
      <div className="wrap" style={{ paddingTop: 24 }}>
        <Suspense fallback={<p className="sub">loading…</p>}>
          <Profile searchParams={searchParams} />
        </Suspense>
        <div style={{ height: 70 }} />
      </div>
    </div>
  );
}

async function Profile({ searchParams }: { searchParams: PageProps<"/profile">["searchParams"] }) {
  const { saved } = await searchParams;
  const user = await requireUser("/profile");
  return (
    <div className="acct">
      <div>
        <h1 className="sec-title">your profile</h1>
        <p className="sub" style={{ marginTop: 4 }}>
          only you see this page. people see you as <b>{personLabel(user)}</b>.
        </p>
      </div>
      {isAdmin(user.netid) && (
        <a className="link-act" href="/admin/imports">
          admin: listserv imports &rarr;
        </a>
      )}
      {saved && (
        <div className="note" role="status">
          saved.
        </div>
      )}
      <div className="blk">
        <AvatarEditor person={user} />
        <div style={{ height: 18 }} />
        <ProfileForm
          defaults={{
            phone: user.phone ? formatPhone(user.phone) : "",
            payments: user.payments,
            building: user.building ?? "",
            roomDirections: user.roomDirections ?? "",
          }}
          about={{
            displayName: user.displayName ?? "",
            bio: user.bio ?? "",
          }}
          next="/profile?saved=1"
          submitLabel="save profile"
        />
      </div>
      <div className="blk" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span className="sub" style={{ margin: 0 }}>
          signed in as <b>{user.email}</b> through princeton CAS
        </span>
        <form action="/api/auth/logout" method="post">
          <button className="btn btn-outline" style={{ padding: "7px 16px" }}>
            sign out
          </button>
        </form>
      </div>
    </div>
  );
}
