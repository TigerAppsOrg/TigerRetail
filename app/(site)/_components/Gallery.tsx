"use client";
import { useState } from "react";

/* Cover photo with a thumbnail strip when there's more than one. */
export function Gallery({ urls, alt }: { urls: string[]; alt: string }) {
  const [i, setI] = useState(0);
  return (
    <div>
      <div className="ph">
        {/* eslint-disable-next-line @next/next/no-img-element -- photos are downscaled on upload */}
        <img src={urls[i]} alt={alt} />
      </div>
      {urls.length > 1 && (
        <div className="thumbs">
          {urls.map((u, k) => (
            <button key={u} className={k === i ? "on" : ""} aria-label={`photo ${k + 1}`} onClick={() => setI(k)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
