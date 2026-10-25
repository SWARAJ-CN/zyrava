"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** The event Chrome fires when the app meets its install criteria. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<{ outcome?: "accepted" | "dismissed" | "unsupported" }>;
};

interface PwaApi {
  /** Ready to install; the browser holds `beforeinstallprompt` back for us. */
  canInstall: boolean;
  /** Running as its own app on the device rather than as a tab in a browser. */
  installed: boolean;
  /** Install touched, waiting on the device to confirm it. */
  installing: boolean;
  install: () => Promise<void>;
}

const PwaContext = createContext<PwaApi>({
  canInstall: false,
  installed: false,
  installing: false,
  install: async () => {},
});

export function usePwa(): PwaApi {
  return useContext(PwaContext);
}

/** Every engine says "this is the installed app" a little differently. */
function readInstalled(): boolean {
  if (typeof window === "undefined") return false;
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches
  );
}

/**
 * Makes the app installable and keeps the offline shell registered. The
 * manifest and icons carry installability on their own; the service worker is
 * only what lets a launched app open without a connection, so it is skipped in
 * development where it would fight the dev server over module caching.
 */
export function PwaProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(readInstalled);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* An unavailable worker costs offline only, never the app itself. */
    });
  }, []);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // Preventing the default keeps Chrome from installing silently in the
      // background and hands the timing to the dock button instead.
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setPrompt(null);
      setInstalling(false);
      setInstalled(true);
    };

    const standalone = window.matchMedia("(display-mode: standalone)");
    const onMode = () => setInstalled(readInstalled());
    standalone.addEventListener("change", onMode);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      standalone.removeEventListener("change", onMode);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!prompt) return;
    setInstalling(true);
    const choice = await prompt.prompt();
    // Turning the dialog down ends the flow; accepting it runs until the
    // device reports the app is really there.
    if (choice?.outcome !== "accepted") setInstalling(false);
  }, [prompt]);

  const value = useMemo<PwaApi>(
    () => ({ canInstall: Boolean(prompt), installed, installing, install }),
    [prompt, installed, installing, install]
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}
