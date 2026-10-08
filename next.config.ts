import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // the round "N" badge sat on top of the filter sidebar's Clear all button;
  // compile and runtime errors still show without it
  devIndicators: false,
};

export default nextConfig;
