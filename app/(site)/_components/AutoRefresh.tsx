"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/* Re-renders the page from the server every few seconds while it's on screen.
   For work that finishes in the background (reading a deck, searching the
   listserv): the page renders this only while something is still going. */
export function AutoRefresh({ seconds = 4 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
