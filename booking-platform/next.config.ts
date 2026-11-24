import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["payglocal-js-client"],
  distDir:process.env.NEXT_DIST_DIR||".next",
  poweredByHeader: false,
  images: { formats: ["image/avif", "image/webp"], minimumCacheTTL: 2592000 },
  async redirects() {
    return [{source:"/terms-and-conditions",destination:"/terms-of-use",permanent:true}];
  },
  async rewrites() {
    // Root-level sitemap URLs cover both hotel and flight page directories.
    // Keep the existing handlers as compatible internal destinations.
    return [
      { source: "/hotel-sitemap.xml", destination: "/hotels/sitemap.xml" },
      { source: "/hotel-sitemap-:shard(\\d+)\\.xml", destination: "/hotels/sitemap/:shard.xml" },
      { source: "/flight-route-sitemap-:shard(\\d+)\\.xml", destination: "/flight-routes-sitemaps/:shard" },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Strict-Transport-Security", value: "max-age=31536000" },
      { key: "Strict-Transport-Security", value: "max-age=31536000" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
  },
  /* config options here */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
