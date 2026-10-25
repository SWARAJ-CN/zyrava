import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  images: {
    // Catalogue artwork is served by the streaming CDNs the app actually
    // talks to. `*.saavncdn.com` covers JioSaavn's tile/artist hosts,
    // `*.scdn.co` Spotify's, and www.jiosaavn.com the error/fallback images.
    // A `**` hostname here would make the optimizer fetch any URL it is given.
    remotePatterns: [
      { protocol: "https", hostname: "*.saavncdn.com" },
      { protocol: "https", hostname: "*.scdn.co" },
      { protocol: "https", hostname: "www.jiosaavn.com" },
    ],
  },
};

export default nextConfig;
