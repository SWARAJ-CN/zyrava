/**
 * Speaking the app back to the user.
 *
 * The browser already knows how to read text aloud — `speechSynthesis` — but
 * it offers no notion of a "mode". So the mode is built here: a voice is
 * chosen for the language, and pitch and rate are bent to give it a character.
 *
 *   male   — a lower, even voice
 *   female — a higher, brighter voice
 *   kid    — the highest, fastest voice of the three
 *
 * The system does not always ship a voice per language, and never one per
 * character, so the character is carried by pitch and rate rather than by the
 * voice file itself.
 */

export type VoiceMode = "male" | "female" | "kid";

export interface VoiceModeInfo {
  value: VoiceMode;
  /** Message key for the mode's name. */
  label: string;
  /** Pitch given to the voice, 0–2. */
  pitch: number;
  /** Speaking rate, 0.1–10. */
  rate: number;
  /** What the voice file is asked to sound like, when one matches. */
  hints: string[];
}

export const VOICE_MODES: VoiceModeInfo[] = [
  {
    value: "male",
    label: "Male",
    pitch: 0.85,
    rate: 1,
    hints: ["male", "man", "boy", "david", "daniel", "alex", "fred", "ravi", "mohan", "prabhat", "gopal", "hemant", "thomas", "george", "ravi "],
  },
  {
    value: "female",
    label: "Female",
    pitch: 1.35,
    rate: 1,
    hints: ["female", "woman", "girl", "samantha", "victoria", "zira", "susan", "karen", "moira", "tessa", "linda", "heaven", "lekha", "swara", "vani", "kavya", "vijaya", "lakshmi", "pallavi", "yara"],
  },
  {
    value: "kid",
    label: "Kid",
    pitch: 1.8,
    rate: 1.15,
    hints: ["child", "kid", "baby", "junior", "little", "bubbles", "trinoids"],
  },
];

export const DEFAULT_VOICE_MODE: VoiceMode = "male";

export function isVoiceMode(value: string | null | undefined): value is VoiceMode {
  return VOICE_MODES.some((mode) => mode.value === value);
}

export function voiceModeInfo(mode: VoiceMode): VoiceModeInfo {
  return VOICE_MODES.find((entry) => entry.value === mode) ?? VOICE_MODES[0];
}

/** Whether this browser can speak at all. */
export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * The voice file that best fits a mode in a language.
 *
 * The language comes first: a voice for the right language reads the words
 * properly even when its character is not quite right, and the character is
 * bent to the mode by pitch and rate anyway. A voice for the wrong language
 * is only used when there is nothing else.
 */
export function pickVoice(
  mode: VoiceMode,
  lang: string,
  voices?: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  if (!canSpeak()) return null;
  const available = voices ?? window.speechSynthesis.getVoices();
  if (!available.length) return null;

  const info = voiceModeInfo(mode);
  const wanted = lang.split("-")[0].toLowerCase();

  const sameLanguage = available.filter(
    (voice) => voice.lang.toLowerCase().split("-")[0] === wanted
  );
  const otherLanguages = available.filter(
    (voice) => voice.lang.toLowerCase().split("-")[0] !== wanted
  );

  const byHint = (pool: SpeechSynthesisVoice[]) =>
    pool.find((voice) => {
      const name = voice.name.toLowerCase();
      return info.hints.some((hint) => name.includes(hint.trim()));
    });

  return (
    byHint(sameLanguage) ??
    sameLanguage[0] ??
    byHint(otherLanguages) ??
    otherLanguages[0] ??
    null
  );
}

/* ------------------------------------------------------- speaking state */

/**
 * Whether the app is talking at the moment.
 *
 * The microphone has to know this: a speaker in the same room as the mic
 * hears the app's own announcements, and the recogniser would take them for
 * commands — "Opened Settings" said aloud, heard by the app, said again.
 * The listener is told when the app starts and stops speaking so the
 * microphone can be held shut in between.
 */
type SpeechListener = (speaking: boolean) => void;

const listeners = new Set<SpeechListener>();
let speaking = false;
/** How many announcements are in flight. */
let pending = 0;
/** Failsafe, in case the browser never reports the end of an utterance. */
let watchdog: ReturnType<typeof setTimeout> | null = null;

export function isSpeaking(): boolean {
  return speaking;
}

export function subscribeSpeech(listener: SpeechListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setSpeaking(next: boolean): void {
  if (speaking === next) return;
  speaking = next;
  for (const listener of listeners) listener(speaking);
}

/** Clears the state when the browser has clearly stopped talking. */
function finished(): void {
  pending = Math.max(0, pending - 1);
  if (pending === 0) setSpeaking(false);
  if (watchdog) {
    clearTimeout(watchdog);
    watchdog = null;
  }
}

/**
 * Speaks a line of text, replacing anything already being said.
 *
 * Announcements are short status messages, so a queue would only make the app
 * fall behind what the user is doing; cutting the previous line off and
 * starting the new one keeps them in step. Pass `queue` when the lines belong
 * together and must be heard in order.
 */
export function speak(
  text: string,
  options: { mode: VoiceMode; lang: string; queue?: boolean }
): void {
  if (!canSpeak() || !text.trim()) return;
  const synth = window.speechSynthesis;
  try {
    if (!options.queue) {
      synth.cancel();
      /* Whatever was being said is not being said any more. */
      pending = 0;
      setSpeaking(false);
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const info = voiceModeInfo(options.mode);
    utterance.lang = options.lang;
    utterance.pitch = info.pitch;
    utterance.rate = info.rate;
    const voice = pickVoice(options.mode, options.lang);
    if (voice) utterance.voice = voice;

    /* The state is set before the utterance starts, so the microphone is
       already closed by the time the first sound comes out. */
    pending += 1;
    setSpeaking(true);

    utterance.onend = finished;
    utterance.onerror = finished;

    synth.speak(utterance);

    /* Some browsers neither start nor end an utterance they dislike; the
       watchdog keeps the microphone from being shut for ever. */
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      pending = 0;
      setSpeaking(false);
      watchdog = null;
    }, 20000);
  } catch {
    /* a browser that refuses to speak should not break the app */
    pending = Math.max(0, pending - 1);
    if (pending === 0) setSpeaking(false);
  }
}

/** Stops whatever is being said. */
export function stopSpeaking(): void {
  if (!canSpeak()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
  pending = 0;
  setSpeaking(false);
  if (watchdog) {
    clearTimeout(watchdog);
    watchdog = null;
  }
}
