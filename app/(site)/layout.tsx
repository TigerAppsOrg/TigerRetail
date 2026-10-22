import { Suspense } from "react";
import { getViewer } from "@/lib/auth";
import { unreadCount } from "@/lib/data";
import { Nav } from "./_components/Nav";
import "./marketplace.css";
import "./site.css";

/* `.wf` scopes the marketplace element styles (see marketplace.css). The nav
   and every page wear it; the map page doesn't, so the ArcGIS widgets keep
   their own look. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-shell">
      <div className="wf nav-holder">
        {/* reads the session (signed in or not), so the nav streams in */}
        <Suspense fallback={<div className="nav" style={{ height: 128 }} />}>
          <NavWithViewer />
        </Suspense>
      </div>
      {children}
    </div>
  );
}

async function NavWithViewer() {
  const viewer = await getViewer();
  const unread = viewer ? await unreadCount(viewer.netid) : 0;
  // only what the nav shows: never pass the whole user (phone, handles) to the client
  return <Nav me={viewer && { netid: viewer.netid, displayName: viewer.displayName, avatarUrl: viewer.avatarUrl }} unread={unread} />;
}
