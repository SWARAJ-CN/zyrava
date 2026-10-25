import { en } from "./messages/en";
import { ta } from "./messages/ta";
import { hi } from "./messages/hi";
import { ml } from "./messages/ml";
import { isCurated } from "./locales";

export type MessageParams = Record<string, string | number>;

/**
 * The hand-written dictionaries, one per curated language.
 *
 * Languages without a dictionary are not listed here: they fall back to
 * English for the interface, and their content is translated into English by
 * `lib/i18n/translate.ts`.
 */
const DICTIONARIES: Record<string, Record<string, string>> = { en, ta, hi, ml };

const ENGLISH: Record<string, string> = en;

/** Fills `{name}` placeholders in a message. */
function interpolate(text: string, params: MessageParams): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * Looks a message up in the given language.
 *
 * The English original is the fallback for every level: a language missing a
 * particular line shows that line in English rather than nothing at all, and
 * a key nobody has written down shows itself so the gap is visible.
 */
export function translate(
  locale: string,
  key: string,
  params?: MessageParams
): string {
  const dictionary = isCurated(locale) ? DICTIONARIES[locale] : undefined;
  const text = dictionary?.[key] ?? ENGLISH[key] ?? key;
  return params ? interpolate(text, params) : text;
}

/**
 * Whether a language has a hand-written translation of every message.
 *
 * Used by the language switcher to tell the reader which languages are
 * complete and which ones arrive through translation instead.
 */
export function isFullyTranslated(locale: string): boolean {
  return isCurated(locale);
}

export { en, ta, hi, ml };
export type { MessageKey } from "./messages/en";
