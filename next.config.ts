import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // the round "N" badge sat on top of the filter sidebar's Clear all button;
  // compile and runtime errors still show without it
  devIndicators: false,
  // No home page for now: the store opens on clothing. Query params pass through.
  async redirects() {
    return [
      { source: "/", destination: "/browse?cat=clothing", permanent: false },
      { source: "/settings", destination: "/profile", permanent: false }, // settings grew into the profile page
    ];
  },
  experimental: {
    // a sell batch posts every item's photos in one Server Action. Photos are
    // downscaled in the browser first (~0.3–0.6 MB each), so 25 MB is ~40 photos.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
