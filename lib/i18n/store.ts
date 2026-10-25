import { DEFAULT_LOCALE, isLocale } from "./locales";

/** Cookie that carries the chosen language to the server on the next load. */
export const LOCALE_COOKIE = "amare_locale";

/** Where the choice is kept on the client. */
const LOCALE_KEY = "amare.locale";

/** Told to whoever wants to know that the language changed. */
const LOCALE_EVENT = "amare:locale";

function fromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
  if (!match) return null;
  const value = decodeURIComponent(match[1]);
  return isLocale(value) ? value : null;
}

/**
 * The language this browser is reading in.
 *
 * The cookie comes first — it is what the server saw when it rendered the
 * page — and local storage is the backup for a browser that has one but not
 * the other.
 */
export function readLocale(): string {
  try {
    const stored = window.localStorage.getItem(LOCALE_KEY);
    if (isLocale(stored)) return stored as string;
  } catch {
    /* storage can be unavailable in private mode */
  }
  return fromCookie() ?? DEFAULT_LOCALE;
}

/**
 * Remembers the language on the client and in a cookie.
 *
 * The cookie is what lets the server render the page in the right language on
 * the next full load, so the interface never flashes English on the way in.
 */
export function writeLocale(code: string): void {
  try {
    window.localStorage.setItem(LOCALE_KEY, code);
  } catch {
    /* ignore */
  }
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(code)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** Announces that the language has changed. */
export function announceLocaleChange(): void {
  window.dispatchEvent(new Event(LOCALE_EVENT));
}

/** Listens for the language changing. */
export function subscribeLocale(onChange: () => void): () => void {
  window.addEventListener(LOCALE_EVENT, onChange);
  return () => {
    window.removeEventListener(LOCALE_EVENT, onChange);
  };
}
