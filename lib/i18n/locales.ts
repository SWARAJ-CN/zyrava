/**
 * The languages the admin can be read in.
 *
 * Four of them are *curated*: every string in the app has a hand-written
 * translation for them, so the interface reads like a native app. The rest are
 * *accepted* — the user may pick them, and any content that arrives in them is
 * translated into English (see `lib/i18n/translate.ts`) rather than left as
 * something the reader cannot make sense of.
 */

export interface LocaleInfo {
  /** BCP-47 code. */
  code: string;
  /** The language's name in that language. */
  nativeName: string;
  /** The language's name in English. */
  englishName: string;
  /** True when the app ships a hand-written translation for it. */
  curated: boolean;
  /** Locale used for dates, numbers and text direction. */
  intl: string;
  /** Accent the speech recogniser and synthesiser are pointed at. */
  speech: string;
  /** Text direction. */
  dir: "ltr" | "rtl";
}

/** Languages with a complete, hand-written translation. */
export const CURATED_LOCALES = ["en", "ta", "hi", "ml"] as const;

export type CuratedLocale = (typeof CURATED_LOCALES)[number];

/** Every language the switcher offers. */
export const LOCALES: LocaleInfo[] = [
  {
    code: "en",
    nativeName: "English",
    englishName: "English",
    curated: true,
    intl: "en-IN",
    speech: "en-IN",
    dir: "ltr",
  },
  {
    code: "ta",
    nativeName: "தமிழ்",
    englishName: "Tamil",
    curated: true,
    intl: "ta-IN",
    speech: "ta-IN",
    dir: "ltr",
  },
  {
    code: "hi",
    nativeName: "हिन्दी",
    englishName: "Hindi",
    curated: true,
    intl: "hi-IN",
    speech: "hi-IN",
    dir: "ltr",
  },
  {
    code: "ml",
    nativeName: "മലയാളം",
    englishName: "Malayalam",
    curated: true,
    intl: "ml-IN",
    speech: "ml-IN",
    dir: "ltr",
  },
  {
    code: "bn",
    nativeName: "বাংলা",
    englishName: "Bengali",
    curated: false,
    intl: "bn-IN",
    speech: "bn-IN",
    dir: "ltr",
  },
  {
    code: "kn",
    nativeName: "ಕನ್ನಡ",
    englishName: "Kannada",
    curated: false,
    intl: "kn-IN",
    speech: "kn-IN",
    dir: "ltr",
  },
  {
    code: "te",
    nativeName: "తెలుగు",
    englishName: "Telugu",
    curated: false,
    intl: "te-IN",
    speech: "te-IN",
    dir: "ltr",
  },
  {
    code: "mr",
    nativeName: "मराठी",
    englishName: "Marathi",
    curated: false,
    intl: "mr-IN",
    speech: "mr-IN",
    dir: "ltr",
  },
  {
    code: "gu",
    nativeName: "ગુજરાતી",
    englishName: "Gujarati",
    curated: false,
    intl: "gu-IN",
    speech: "gu-IN",
    dir: "ltr",
  },
  {
    code: "pa",
    nativeName: "ਪੰਜਾਬੀ",
    englishName: "Punjabi",
    curated: false,
    intl: "pa-IN",
    speech: "pa-IN",
    dir: "ltr",
  },
  {
    code: "ur",
    nativeName: "اردو",
    englishName: "Urdu",
    curated: false,
    intl: "ur-IN",
    speech: "ur-IN",
    dir: "rtl",
  },
  {
    code: "ar",
    nativeName: "العربية",
    englishName: "Arabic",
    curated: false,
    intl: "ar",
    speech: "ar-SA",
    dir: "rtl",
  },
  {
    code: "zh",
    nativeName: "中文",
    englishName: "Chinese",
    curated: false,
    intl: "zh-CN",
    speech: "zh-CN",
    dir: "ltr",
  },
  {
    code: "ja",
    nativeName: "日本語",
    englishName: "Japanese",
    curated: false,
    intl: "ja-JP",
    speech: "ja-JP",
    dir: "ltr",
  },
  {
    code: "ko",
    nativeName: "한국어",
    englishName: "Korean",
    curated: false,
    intl: "ko-KR",
    speech: "ko-KR",
    dir: "ltr",
  },
  {
    code: "es",
    nativeName: "Español",
    englishName: "Spanish",
    curated: false,
    intl: "es-ES",
    speech: "es-ES",
    dir: "ltr",
  },
  {
    code: "fr",
    nativeName: "Français",
    englishName: "French",
    curated: false,
    intl: "fr-FR",
    speech: "fr-FR",
    dir: "ltr",
  },
  {
    code: "de",
    nativeName: "Deutsch",
    englishName: "German",
    curated: false,
    intl: "de-DE",
    speech: "de-DE",
    dir: "ltr",
  },
  {
    code: "pt",
    nativeName: "Português",
    englishName: "Portuguese",
    curated: false,
    intl: "pt-BR",
    speech: "pt-BR",
    dir: "ltr",
  },
  {
    code: "ru",
    nativeName: "Русский",
    englishName: "Russian",
    curated: false,
    intl: "ru-RU",
    speech: "ru-RU",
    dir: "ltr",
  },
  {
    code: "id",
    nativeName: "Bahasa Indonesia",
    englishName: "Indonesian",
    curated: false,
    intl: "id-ID",
    speech: "id-ID",
    dir: "ltr",
  },
  {
    code: "vi",
    nativeName: "Tiếng Việt",
    englishName: "Vietnamese",
    curated: false,
    intl: "vi-VN",
    speech: "vi-VN",
    dir: "ltr",
  },
  {
    code: "tr",
    nativeName: "Türkçe",
    englishName: "Turkish",
    curated: false,
    intl: "tr-TR",
    speech: "tr-TR",
    dir: "ltr",
  },
];

const BY_CODE = new Map(LOCALES.map((locale) => [locale.code, locale]));

export const DEFAULT_LOCALE = "en";

export function isLocale(code: string | null | undefined): boolean {
  return !!code && BY_CODE.has(code);
}

export function localeInfo(code: string): LocaleInfo {
  return BY_CODE.get(code) ?? BY_CODE.get(DEFAULT_LOCALE)!;
}

/** True when the app ships a full translation for this language. */
export function isCurated(code: string): boolean {
  return localeInfo(code).curated;
}
