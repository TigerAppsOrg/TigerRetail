"use client";
/* The wireframe's navBar(): wordmark, search, map, my stuff, + sell, sign out,
   then one category row. The department switch lives on the filter row; its
   value is in the URL (?dept=), so section links carry it along. */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SECTION_NAMES } from "@/lib/catalog";
import { unreadCountAction } from "../actions";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";

export type NavPerson = { netid: string; displayName: string | null; avatarUrl: string | null };

export function Nav({ me, unread: initialUnread = 0 }: { me: NavPerson | null; unread?: number }) {
  const path = usePathname();
  const params = useSearchParams();
  const dept = params.get("dept") ?? "all";
  const activeCat = path === "/browse" ? params.get("cat") : null;
  const [scrolled, setScrolled] = useState(false);
  const [unread, setUnread] = useState(initialUnread);

  // the layout (and so this nav) doesn't re-render on client navigation, so
  // the unread count refreshes itself: on every page change and every 20s
  const netid = me?.netid ?? null;
  useEffect(() => {
    if (!netid) return;
    let stopped = false;
    const check = () => unreadCountAction().then((n) => !stopped && setUnread(n), () => {});
    check();
    const t = setInterval(() => !document.hidden && check(), 20_000);
    window.addEventListener("tr:unread-changed", check); // an open conversation just marked messages read
    return () => {
      stopped = true;
      clearInterval(t);
      window.removeEventListener("tr:unread-changed", check);
    };
    // depend on the netid, not the `me` object: the server sends a fresh object
    // with every render, and re-running on that made this check loop forever
  }, [netid, path]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const withDept = (href: string, d = dept) => (d === "all" ? href : `${href}${href.includes("?") ? "&" : "?"}dept=${encodeURIComponent(d)}`);
  const sectionHref = (c: string, d = dept) => withDept(`/browse?cat=${encodeURIComponent(c)}`, d);

  return (
    <div className={`nav ${scrolled ? "scrolled" : ""}`}>
      <div className="nav-in">
        <Link className="wordmark" href={sectionHref("clothing")}>
          dePAWp
        </Link>
        <form className="navsearch" role="search" action="/browse">
          <Icon name="search" />
          <input type="search" name="q" defaultValue={path === "/browse" ? (params.get("q") ?? "") : ""} placeholder="search listings" aria-label="search listings" />
          {dept !== "all" && <input type="hidden" name="dept" value={dept} />}
        </form>
        <div className="nav-right">
          <Link className={`icon-lbl ${path === "/map" ? "active" : ""}`} href="/map">
            <Icon name="map" />
            <span>map</span>
          </Link>
          {me && (
            <Link className={`icon-lbl ${path.startsWith("/messages") ? "active" : ""}`} href="/messages">
              <Icon name="chat" />
              <span>messages</span>
              {unread > 0 && (
                <i className="badge" aria-label={`${unread} unread`}>
                  {unread}
                </i>
              )}
            </Link>
          )}
          <Link className={`icon-lbl ${path === "/me" ? "active" : ""}`} href="/me">
            <Icon name="tag" />
            <span>my stuff</span>
          </Link>
          <Link className={`pill-sell ${path.startsWith("/sell") ? "active" : ""}`} href="/sell">
            <Icon name="plus" /> sell
          </Link>
          {me ? (
            <Link className={`me-link ${path === "/profile" ? "active" : ""}`} href="/profile" aria-label="your profile" title="your profile">
              <Avatar person={me} size={34} />
            </Link>
          ) : (
            <Link className="icon-lbl" href="/login">
              sign in
            </Link>
          )}
        </div>
      </div>
      <div className="catbar">
        <div className="catbar-in">
          {SECTION_NAMES.map((c) => (
            <Link key={c} className={`cat-btn ${activeCat === c ? "active" : ""}`} href={sectionHref(c)} aria-current={activeCat === c ? "page" : undefined}>
              {c}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
