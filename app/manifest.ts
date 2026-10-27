import type { MetadataRoute } from "next";

/**
 * Install manifest. Chrome needs the name, a standalone display, a start_url
 * and both a 192px and a 512px icon before it will offer an install; the
 * maskable copy is the one Android pads into its launcher shape.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ZYRAVA",
    short_name: "ZYRAVA",
    description:
      "Browse music by region — pick a language, search anything, and listen with your own equalizer.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    /* Where the OS allows it, standalone; the fallbacks keep the app windowed
       rather than falling all the way back to a plain browser tab. */
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    launch_handler: {
      client_mode: ["focus-existing", "auto"],
    },
    background_color: "#17111c",
    theme_color: "#17111c",
    categories: ["music", "entertainment"],
    icons: [
      { src: "/icons/pwa-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/pwa-512x512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
