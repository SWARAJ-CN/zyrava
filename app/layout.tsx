import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { InlineScript } from "@/components/InlineScript";
import { VisitBeacon } from "@/components/VisitBeacon";
import { AppChrome } from "@/components/AppChrome";
import { AuthGate } from "@/components/auth/AuthGate";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { GuestLockProvider } from "@/components/providers/GuestLockProvider";
import { LibraryProvider } from "@/components/providers/LibraryProvider";
import { TasteProvider } from "@/components/providers/TasteProvider";
import { OfflineProvider } from "@/components/providers/OfflineProvider";
import { PlaybackSessionGuard } from "@/components/providers/PlaybackSessionGuard";
import { PwaProvider } from "@/components/providers/PwaProvider";
import { IdleNotifier } from "@/components/providers/IdleNotifier";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { CommunityProvider } from "@/components/providers/CommunityProvider";
import { I18nProvider } from "@/components/providers/I18nProvider";
import { MusicPlayerProvider } from "@/components/providers/MusicPlayerProvider";
import { localeInfo } from "@/lib/i18n/locales";
import { readRequestLocale } from "@/lib/i18n/server";

/* Inter is the whole app's typeface — one family for headings, body
   copy and the console's numeric readouts. Self-hosted by next/font, so no
   request ever leaves for Google at runtime. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/* Device pixels, the CSS size that media query matches them, and the scale. */
const APPLE_SPLASH: Array<[readonly [number, number], readonly [number, number], number]> = [
  [[1290, 2796], [430, 932], 3], // 14 Pro Max · 15 Pro Max · 16 Plus
  [[1284, 2778], [428, 926], 3], // 12 Pro Max · 13 Pro Max · 14 Plus
  [[1179, 2556], [393, 852], 3], // 14 Pro · 15 Pro · 16 · 16 Pro
  [[1170, 2532], [390, 844], 3], // 12 · 13 · 14
  [[1125, 2436], [375, 812], 3], // X · XS · 11 Pro
  [[1080, 2340], [360, 780], 3], // 12 mini · 13 mini
  [[1242, 2688], [414, 896], 3], // XS Max · 11 Pro Max
  [[828, 1792], [414, 896], 2], // XR · 11
  [[1242, 2208], [414, 736], 3], // 8 Plus
  [[750, 1334], [375, 667], 2], // SE 2 · SE 3 · 8
  [[2048, 2732], [1024, 1366], 2], // iPad Pro 12.9
  [[1668, 2388], [834, 1194], 2], // iPad Pro 11 · iPad Air
  [[1620, 2160], [810, 1080], 2], // iPad 10
  [[1536, 2048], [768, 1024], 2], // iPad mini · older Airs
];

export const metadata: Metadata = {
  title: {
    default: "ZYRAVA",
    template: "%s · ZYRAVA",
  },
  description: "Browse music by region — pick a language, search anything, and listen with your own equalizer.",
  applicationName: "ZYRAVA",
  icons: {
    // app/icon.png is served, but the manual <head> below stops Next from
    // linking it on its own, so the href is declared here.
    icon: "/icon.png",
    apple: "/icons/apple-icon.png",
  },
  // iOS has no beforeinstallprompt: this is what turns Add to Home Screen into
  // a standalone window instead of a bookmark that opens in Safari's chrome.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ZYRAVA",
    /*
     * On an installed app iOS draws the launch screen itself, out of one
     * full-size image per device. Linked to nothing, a cold start is a blank
     * page until the first paint arrives — which is what made the splash look
     * broken on a phone. Portrait covers the devices people actually install
     * on; an unmatched screen falls back to the background colour rather than
     * to a stretched picture.
     */
    startupImage: APPLE_SPLASH.map(([pixels, css, scale]) => ({
      url: `/splash/startup-${pixels[0]}x${pixels[1]}.png`,
      media:
        `(device-width: ${css[0]}px) and (device-height: ${css[1]}px) ` +
        `and (-webkit-device-pixel-ratio: ${scale}) and (orientation: portrait)`,
    })),
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#17111c" },
  ],
};

// Applies the saved theme and brand colour before first paint so the page
// never flashes the defaults. HeroUI switches on `data-theme`/`class`, so
// "system" is resolved to a concrete scheme here.
const themeScript = `(function(){try{
var t=localStorage.getItem('music-theme');
var m=(t==='light'||t==='dark')?t:'dark';
var r=document.documentElement;
r.dataset.theme=m;
r.classList.add(m);
r.classList.remove(m==='dark'?'light':'dark');
var b=localStorage.getItem('music-brand.vars.v1');
if(b){var v=JSON.parse(b);for(var k in v){if(Object.prototype.hasOwnProperty.call(v,k)){r.style.setProperty(k,v[k]);}}}
}catch(e){}})();`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  /* The language comes from a cookie, so the very first paint is already in
     the reader's language rather than English. */
  const locale = await readRequestLocale();
  const info = localeInfo(locale);

  return (
    <html
      lang={info.intl}
      dir={info.dir}
      data-theme="dark"
      suppressHydrationWarning
      className={`${inter.variable} h-full antialiased`}
    >
      <head>
        <InlineScript html={themeScript} />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <I18nProvider initialLocale={locale}>
          <PwaProvider>
            <VisitBeacon />
            <IdleNotifier />
            <ThemeProvider>
              <AuthProvider>
                <GuestLockProvider>
                  <ToastProvider>
                    <CommunityProvider>
                      <TasteProvider>
                        <OfflineProvider>
                          <MusicPlayerProvider>
                            <LibraryProvider>
                              <PlaybackSessionGuard />
                              <AppChrome />
                              <AuthGate>{children}</AuthGate>
                            </LibraryProvider>
                          </MusicPlayerProvider>
                        </OfflineProvider>
                      </TasteProvider>
                    </CommunityProvider>
                  </ToastProvider>
                </GuestLockProvider>
              </AuthProvider>
            </ThemeProvider>
          </PwaProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
