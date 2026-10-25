import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale } from "./locales";
import { LOCALE_COOKIE } from "./store";

/**
 * The language this request asked for.
 *
 * Read on the server so the first paint is already in the right language
 * rather than switching to it once the app has hydrated.
 */
export async function readRequestLocale(): Promise<string> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(value)) return value as string;
  return DEFAULT_LOCALE;
}
