"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  readVoiceLanguage,
  readVoiceLanguageOnServer,
  subscribeVoiceLanguage,
  voiceAccent,
  voiceLocale,
} from "@/lib/voice";
import { translate, type MessageParams } from "@/lib/i18n";
import { useI18n } from "./I18nProvider";

interface VoiceLanguageValue {
  /** The accent the reader has chosen, or "" when it follows the app. */
  language: string;
  /** The language the assistant listens and speaks in. */
  locale: string;
  /** The accent the recogniser and the voice should use. */
  accent: string;
  /** The name of the app's language, in that language. */
  appName: string;
  /** Reads a message in the voice language. */
  t: (key: string, params?: MessageParams) => string;
  /** The voice language as it should be shown in a list. */
  languages: { value: string; label: string; native: string }[];
}

/**
 * The language of the whole voice conversation.
 *
 * Choosing a language here changes the whole exchange, not just the accent the
 * microphone listens for: the words the assistant expects are the ones of that
 * language, the pages are named in it, and the replies come back in it.
 */
export function useVoiceLanguage(): VoiceLanguageValue {
  const { locale: appLocale, info } = useI18n();

  const language = useSyncExternalStore(
    subscribeVoiceLanguage,
    readVoiceLanguage,
    readVoiceLanguageOnServer
  );

  const locale = voiceLocale(language, appLocale);
  const accent = voiceAccent(language, info.speech);

  const t = useCallback(
    (key: string, params?: MessageParams) => translate(locale, key, params),
    [locale]
  );

  const languages = useMemo(
    () => [
      { value: "", label: info.nativeName, native: "" },
      { value: "en-IN", label: "English (India)", native: "English" },
      { value: "ta-IN", label: "Tamil", native: "தமிழ்" },
      { value: "hi-IN", label: "Hindi", native: "हिन्दी" },
      { value: "ml-IN", label: "Malayalam", native: "മലയാളം" },
    ],
    [info.nativeName]
  );

  return { language, locale, accent, appName: info.nativeName, t, languages };
}
