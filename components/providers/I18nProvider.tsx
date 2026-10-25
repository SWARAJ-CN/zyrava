"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { translate, type MessageParams } from "@/lib/i18n";
import { isCurated, localeInfo, type LocaleInfo } from "@/lib/i18n/locales";
import {
  announceLocaleChange,
  readLocale,
  subscribeLocale,
  writeLocale,
} from "@/lib/i18n/store";
import { setCurrentLocale } from "@/lib/i18n/current";
import { setFormatLocale } from "@/lib/format";

interface I18nContextValue {
  /** The language the app is reading in. */
  locale: string;
  /** Everything the reader needs to know about that language. */
  info: LocaleInfo;
  /** Switches the language. */
  setLocale: (code: string) => void;
  /** Reads a message in the current language. */
  t: (key: string, params?: MessageParams) => string;
  /** Text direction of the current language. */
  dir: "ltr" | "rtl";
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Holds the chosen language for the whole app.
 *
 * The language arrives from the server (a cookie), so the first paint is
 * already correct; the client takes over afterwards and keeps the choice in
 * local storage and a cookie for the next visit.
 */
export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: string;
  children: ReactNode;
}) {
  /* The language comes from the server (a cookie), so the first paint is
     already correct; the client takes over afterwards and keeps the choice in
     local storage and a cookie for the next visit. */
  const locale = useSyncExternalStore(subscribeLocale, readLocale, () => initialLocale);

  /* Code that is not a React component — the data layer, the invoice — needs
     to know the language too, so it is published as soon as it is known. */
  setCurrentLocale(locale);

  /* Keep the document in step, so screen readers and the browser's own
     hyphenation follow the language. */
  const firstRun = useRef(true);
  useEffect(() => {
    const info = localeInfo(locale);
    document.documentElement.lang = info.intl;
    document.documentElement.dir = info.dir;
    /* Numbers and dates are written the way the language writes them — but a
       language the app has no translation of is still read in English, and an
       Indian shop still counts in lakhs. */
    setFormatLocale(isCurated(locale) ? info.intl : "en-IN");
    /* Anyone who needs to reload the shop's data in the new language is
       listening for this. The first run is not a change, so it is quiet. */
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    announceLocaleChange();
  }, [locale]);

  const setLocale = useCallback((code: string) => {
    writeLocale(code);
    announceLocaleChange();
  }, []);

  const t = useCallback(
    (key: string, params?: MessageParams) => translate(locale, key, params),
    [locale]
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, info: localeInfo(locale), setLocale, t, dir: localeInfo(locale).dir }),
    [locale, setLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}

/** Just the translation function, for the many components that need nothing else. */
export function useT(): I18nContextValue["t"] {
  return useI18n().t;
}
