import type { NextConfig } from "next";

/** Where the account API runs. Reached through this app, never from the page. */
const accountApi = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  images: {
    // Catalogue artwork comes from the streaming CDNs the app talks to: the
    // `*.saavncdn.com` tile hosts, `*.scdn.co` and the source site's own
    // fallback images. A `**` hostname here would make the optimizer fetch
    // any URL it is given.
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
