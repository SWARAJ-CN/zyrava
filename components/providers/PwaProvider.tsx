"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/** The event Chrome fires when the app meets its install criteria. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};

interface PwaApi {
  /** Ready to install; the browser holds `beforeinstallprompt` back for us. */
  canInstall: boolean;
  install: () => Promise<void>;
}

const PwaContext = createContext<PwaApi>({
  canInstall: false,
  install: async () => {},
});

export function usePwa(): PwaApi {
  return useContext(PwaContext);
}

/**
 * Makes the app installable and keeps the offline shell registered. The
 * manifest and icons carry installability on their own; the service worker is
 * only what lets a launched app open without a connection, so it is skipped in
 * development where it would fight the dev server over module caching.
 */
export function PwaProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

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
    const onInstalled = () => setPrompt(null);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!prompt) return;
    await prompt.prompt();
    setPrompt(null);
  }, [prompt]);

  return (
    <PwaContext.Provider value={{ canInstall: Boolean(prompt), install }}>
      {children}
    </PwaContext.Provider>
  );
}
