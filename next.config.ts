import type { NextConfig } from "next";

/** Where the account API runs. Reached through this app, never from the page. */
const accountApi = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  images: {
    /*
     * Artwork is served straight from the music CDNs.
     *
     * Routing covers through /_next/image put every tile behind Vercel's Image
     * Optimization quota; when that quota ran out the optimizer answered
     * 402 Payment Required and the affected covers rendered as broken images
     * even though the CDN file itself was healthy. The catalogue already hands
     * us pre-sized 150x150 / 500x500 JPEGs, so there is nothing to optimise —
     * letting the browser fetch them directly keeps artwork loading.
     */
    unoptimized: true,
    // Kept for documentation / future re-enablement of the optimizer: catalogue
    // artwork comes from the `*.saavncdn.com` tile hosts, `*.scdn.co` and the
    // source site's own fallback images.
    remotePatterns: [
      { protocol: "https", hostname: "*.saavncdn.com" },
      { protocol: "https", hostname: "*.scdn.co" },
      { protocol: "https", hostname: "www.jiosaavn.com" },
    ],
  },
  async rewrites() {
    /*
     * Auth is proxied rather than called cross-origin. The session and CSRF
     * cookies then belong to this site, which is the only way they survive
     * Safari and Firefox — those browsers refuse third-party cookies, so a
     * direct call to the API host made every sign-in fail with a bad CSRF
     * token. The path is kept identical so the API's own cookie paths match.
     */
    return [
      { source: "/api/auth/:path*", destination: `${accountApi}/api/auth/:path*` },
      { source: "/api/library/:path*", destination: `${accountApi}/api/library/:path*` },
      // Arrival is recorded same-origin too: a cross-origin JSON POST would
      // need a preflight, and a visitor's first request should not be one.
      { source: "/api/visits", destination: `${accountApi}/api/visits` },
    ];
  },
};

export default nextConfig;
