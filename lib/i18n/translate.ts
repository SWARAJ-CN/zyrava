/**
 * Translating content that arrives in a language the app has no translation
 * for.
 *
 * Four languages are translated by hand, so their content is shown as it
 * comes. For every other language the reader picks, the shop's own words —
 * a product name typed in Bengali, a note written in Kannada — are
 * translated into English so they can be read.
 *
 * The translation is a display concern only: nothing is written back to the
 * shop's records, so the original wording is never lost.
 */

import { currentLocale } from "./current";
import { isCurated, localeInfo } from "./locales";

/** Google's public translation endpoint — no key, no account, no cost. */
const ENDPOINT = "https://translate.googleapis.com/translate_a/single";

/** Lines are joined before they are sent, so one request carries many. */
const SEPARATOR = "\n";

const CACHE_KEY = "amare.translate.cache";
const CACHE_LIMIT = 400;

type Cache = Record<string, string>;

let cache: Cache | null = null;

function readCache(): Cache {
  if (cache) return cache;
  cache = {};
  try {
    const stored = window.localStorage.getItem(CACHE_KEY);
    if (stored) cache = JSON.parse(stored) as Cache;
  } catch {
    /* storage can be unavailable in private mode */
  }
  return cache;
}

function writeCache(entry: Cache): void {
  cache = entry;
  try {
    const keys = Object.keys(entry);
    if (keys.length > CACHE_LIMIT) {
      // Keep the most recent entries; the object preserves insertion order.
      const trimmed = Object.fromEntries(keys.slice(-CACHE_LIMIT).map((key) => [key, entry[key]]));
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
      return;
    }
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* ignore */
  }
}

/**
 * Translates a piece of text into English.
 *
 * The source language is detected by the service, which is what makes this
 * useful: the same shop may hold notes in three languages at once.
 *
 * Anything that goes wrong — no network, a service that is down, text the
 * service cannot make sense of — leaves the original wording alone. Showing
 * the reader the original is better than showing them nothing.
 */
export async function translateToEnglish(
  text: string,
  from = "auto"
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;

  const stored = readCache();
  const key = `${from}|${trimmed}`;
  const cached = stored[key];
  if (cached !== undefined) return cached;

  try {
    const params = new URLSearchParams({
      client: "gtx",
      sl: from,
      tl: "en",
      dt: "t",
      q: trimmed,
    });
    const response = await fetch(`${ENDPOINT}?${params.toString()}`);
    if (!response.ok) return text;

    const payload = (await response.json()) as unknown;
    const translated = readTranslation(payload);
    if (!translated) return text;

    writeCache({ ...stored, [key]: translated });
    return translated;
  } catch {
    return text;
  }
}

/**
 * Translates several pieces of text in one request.
 *
 * Newlines survive the round trip, so the pieces can be joined, sent and
 * split again — one request instead of one per row.
 */
export async function translateManyToEnglish(
  texts: string[],
  from = "auto"
): Promise<string[]> {
  const results = [...texts];
  const wanted: number[] = [];

  texts.forEach((text, index) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const cached = readCache()[`${from}|${trimmed}`];
    if (cached !== undefined) {
      results[index] = cached;
      return;
    }
    wanted.push(index);
  });

  if (!wanted.length) return results;

  const joined = wanted.map((index) => texts[index].trim()).join(SEPARATOR);
  try {
    const params = new URLSearchParams({
      client: "gtx",
      sl: from,
      tl: "en",
      dt: "t",
      q: joined,
    });
    const response = await fetch(`${ENDPOINT}?${params.toString()}`);
    if (!response.ok) return results;

    const payload = (await response.json()) as unknown;
    const translated = readTranslation(payload);
    if (!translated) return results;

    const lines = translated.split(SEPARATOR);
    const stored = { ...readCache() };
    wanted.forEach((index, position) => {
      const line = lines[position]?.trim();
      if (!line) return;
      results[index] = line;
      stored[`${from}|${texts[index].trim()}`] = line;
    });
    writeCache(stored);
  } catch {
    /* keep the original wording */
  }

  return results;
}

/** Pulls the translated text out of the service's reply. */
function readTranslation(payload: unknown): string {
  if (!Array.isArray(payload)) return "";
  const sentences = payload[0];
  if (!Array.isArray(sentences)) return "";
  const text = sentences
    .map((chunk) => (Array.isArray(chunk) ? String(chunk[0] ?? "") : ""))
    .join("")
    .trim();
  return text;
}

/**
 * Whether content should be translated before it is shown.
 *
 * Only for the languages the app has no translation of. In the four languages
 * it is written in, the shop's own words are shown exactly as they are.
 */
export function shouldTranslateContent(): boolean {
  return !isCurated(currentLocale());
}

/** The language content is assumed to be written in. */
export function contentSourceLanguage(): string {
  const locale = currentLocale();
  if (isCurated(locale)) return localeInfo(locale).speech;
  return "auto";
}
