import Link from "next/link";
import type { ReactNode } from "react";

/* A person's name or avatar, linking to their public page. */
export function PersonLink({ netid, children, className = "person" }: { netid: string; children: ReactNode; className?: string }) {
  return (
    <Link className={className} href={`/u/${encodeURIComponent(netid)}`} style={{ color: "inherit", textDecoration: "none" }}>
      {children}
    </Link>
  );
}
