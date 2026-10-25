import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { InlineScript } from "@/components/InlineScript";
import { AppChrome } from "@/components/AppChrome";
import { AuthGate } from "@/components/auth/AuthGate";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { LibraryProvider } from "@/components/providers/LibraryProvider";
import { OfflineProvider } from "@/components/providers/OfflineProvider";
import { PlaybackSessionGuard } from "@/components/providers/PlaybackSessionGuard";
import { PwaProvider } from "@/components/providers/PwaProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
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

export const metadata: Metadata = {
  title: {
    default: "ZYRAVA",
    template: "%s · ZYRAVA",
  },
  description: "Browse music by region — pick a language, search anything, and listen with your own equalizer.",
  applicationName: "ZYRAVA",
  icons: {
    // app/icon.svg is served, but the manual <head> below stops Next from
    // linking it on its own, so the href is declared here.
    icon: "/icon.svg",
    apple: "/icons/apple-icon.png",
  },
  // iOS has no beforeinstallprompt: this is what turns Add to Home Screen into
  // a standalone window instead of a bookmark that opens in Safari's chrome.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ZYRAVA",
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
            <ThemeProvider>
              <AuthProvider>
                <ToastProvider>
                  <OfflineProvider>
                    <MusicPlayerProvider>
                      <LibraryProvider>
                        <PlaybackSessionGuard />
                        <AppChrome />
                        <AuthGate>{children}</AuthGate>
                      </LibraryProvider>
                    </MusicPlayerProvider>
                  </OfflineProvider>
                </ToastProvider>
              </AuthProvider>
            </ThemeProvider>
          </PwaProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
