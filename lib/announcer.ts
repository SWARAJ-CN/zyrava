/**
 * The voice output switch.
 *
 * Speech synthesis is off until the reader turns it on — a shop owner does not
 * want their browser talking over the till — but once it is on, the app says
 * what is happening: which page opened, what was saved, what went wrong.
 *
 * Kept as a plain module store, like the voice operation registry, so any
 * component can announce anything without the pages having to be threaded
 * through a provider.
 */

import {
  canSpeak,
  DEFAULT_VOICE_MODE,
  isVoiceMode,
  speak,
  stopSpeaking,
  type VoiceMode,
} from "./speech";

const OUTPUT_KEY = "amare.voice.output";
const MODE_KEY = "amare.voice.mode";

interface VoiceOutputState {
  output: boolean;
  mode: VoiceMode;
  /** The language the app is reading in, so the voice matches it. */
  lang: string;
}

const state: VoiceOutputState = {
  output: false,
  mode: DEFAULT_VOICE_MODE,
  lang: "en-IN",
};

let loaded = false;
const listeners = new Set<() => void>();

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const output = window.localStorage.getItem(OUTPUT_KEY);
    if (output !== null) state.output = output === "true";
    const mode = window.localStorage.getItem(MODE_KEY);
    if (isVoiceMode(mode)) state.mode = mode;
  } catch {
    /* storage can be unavailable in private mode */
  }
}

function changed(): void {
  for (const listener of listeners) listener();
}

function persist(): void {
  try {
    window.localStorage.setItem(OUTPUT_KEY, String(state.output));
    window.localStorage.setItem(MODE_KEY, state.mode);
  } catch {
    /* ignore */
  }
}

export function readVoiceOutput(): boolean {
  load();
  return state.output;
}

export function readVoiceMode(): VoiceMode {
  load();
  return state.mode;
}

export function readSpeechLang(): string {
  load();
  return state.lang;
}

/** `useSyncExternalStore`'s server snapshot — nothing is said on the server. */
export const readVoiceOutputOnServer = (): boolean => false;
export const readVoiceModeOnServer = (): VoiceMode => DEFAULT_VOICE_MODE;

export function subscribeVoiceOutput(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Turns the voice on or off.
 *
 * Turning it on says so out loud, because the switch is the only way the
 * reader finds out that the app can speak at all.
 */
export function setVoiceOutput(output: boolean): void {
  load();
  state.output = output;
  persist();
  changed();
  if (!output) stopSpeaking();
}

export function setVoiceMode(mode: VoiceMode): void {
  load();
  state.mode = mode;
  persist();
  changed();
}

/** Keeps the speaking voice in step with the language of the interface. */
export function setSpeechLang(lang: string): void {
  load();
  if (state.lang === lang) return;
  state.lang = lang;
}

/**
 * Says a line, when the reader has asked to hear things.
 *
 * `force` speaks even with the voice output switched off — used for the
 * confirmation the reader gets when turning it on. `queue` keeps the line
 * behind whatever is being said, for sentences that belong together.
 * `lang` speaks the line in a particular language, for the lines that are
 * written in one — a message from the shop, say, rather than from the
 * assistant.
 */
export function announce(
  text: string,
  options?: { force?: boolean; queue?: boolean; lang?: string }
): void {
  load();
  if (!state.output && !options?.force) return;
  if (!canSpeak()) return;
  speak(text, {
    mode: state.mode,
    lang: options?.lang ?? state.lang,
    queue: options?.queue,
  });
}
