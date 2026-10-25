/**
 * Voice command grammar.
 *
 * Speech recognition gives us loose text — "go to the sales page", "sales",
 * "show me products" — so matching is deliberately forgiving but must not fire
 * on ordinary conversation. A phrase only counts when it is either
 *
 *   1. opened with a verb ("go to…", "open…", "show me…"), where the page name
 *      may sit anywhere in the sentence, or
 *   2. the whole utterance, once filler words are dropped ("the sales page",
 *      "products please").
 *
 * Within that rule the match is scored rather than filtered, so a mis-heard
 * spelling still lands on the right page: an exact hit scores 1, and a near
 * miss scores by how far off it was. Callers act on a high score and offer the
 * rest as suggestions.
 *
 * The grammar is built per language, because the app is read in more than one.
 * The page names come from the interface in the reader's own language, and the
 * verbs and filler words are the ones of that language — including the fact
 * that Tamil, Hindi and Malayalam put the verb at the end of the sentence
 * rather than the beginning.
 */

export type VoiceThemeMode = "light" | "dark" | "system";

export type VoiceAction =
  | { kind: "navigate"; href: string; label: string }
  | { kind: "theme"; mode: VoiceThemeMode; label: string }
  | { kind: "refresh"; label: string }
  | { kind: "stop"; label: string }
  /** An operation the current page has put up for grabs. */
  | { kind: "op"; id: string; label: string };

export interface VoiceCandidate {
  /** Word sequence that triggers the command, lowercase and punctuation-free. */
  phrase: string[];
  action: VoiceAction;
}

/**
 * Extra names people actually say, on top of each page's own label.
 */
export interface VoiceOpSpec {
  id: string;
  label: string;
  /** Trigger words, e.g. ["new sale", "add sale"]. */
  phrases: string[];
}

/**
 * Turns page-registered operations into matchable candidates.
 *
 * Kept here rather than beside the registry, so the grammar stays independent
 * of how operations are stored. The label itself is always a trigger too.
 */
export function opsToCandidates(ops: VoiceOpSpec[]): VoiceCandidate[] {
  return ops.flatMap((entry) => {
    const seen = new Set<string>();
    const phrases = [entry.label, ...entry.phrases]
      .map((phrase) => words(phrase).join(" "))
      .filter((key) => {
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return phrases.map((key) => ({
      phrase: key.split(" "),
      action: { kind: "op", id: entry.id, label: entry.label } as VoiceAction,
    }));
  });
}

/** Extra names people actually say, on top of each page's own label. */
const NAV_ALIASES: Record<string, string[]> = {
  "/": ["home", "overview", "main", "start", "homepage", "summary"],
  "/reports": ["report", "analytics", "analysis", "trends", "charts", "stats", "statistics"],
  "/sales": [
    "sale",
    "sails",
    "sells",
    "bills",
    "bill",
    "orders",
    "order",
    "invoices",
    "invoice",
    "custom orders",
  ],
  "/expenses": ["expense", "spending", "costs", "purchases"],
  "/products": ["product", "items", "catalogue", "stock", "inventory"],
  "/calculations": ["calculations", "calculation", "pricing", "quotes"],
  "/database": ["db", "data", "collections", "records"],
  "/server": ["backend", "status", "endpoints", "uptime", "server status"],
  "/settings": ["setting", "preferences", "profile", "invoice settings"],
  "/developer": ["dev", "code", "codebase", "git", "repo", "repository"],
};

/**
 * The same aliases, said in the languages the app is written in.
 *
 * Without these, a page called "விற்பனைகள்" could only be reached by saying
 * the English word for it — which is no use to someone who cannot read it.
 *
 * Both the words that are translated ("அமைப்புகள்") and the ones that are
 * only pronounced in English ("செட்டிங்ஸ்") are here, because people write
 * and say both.
 */
const LOCALIZED_NAV_ALIASES: Record<string, Record<string, string[]>> = {
  ta: {
    "/": ["முகப்பு", "மேலோட்டம்", "மொத்தம்", "டாஷ்போர்டு", "டாஷ்போர்ட்"],
    "/reports": [
      "அறிக்கை",
      "அறிக்கைகள்",
      "ஆய்வு",
      "ரிபோர்ட்",
      "ரிப்போர்ட்ஸ்",
      "ரிபோர்டு",
    ],
    "/sales": [
      "விற்பனை",
      "விற்பனைகள்",
      "பண்டிகை",
      "ரசீது",
      "சேல்ஸ்",
      "பில்",
      "பில்கள்",
    ],
    "/expenses": [
      "செலவு",
      "செலவுகள்",
      "வெளியீடு",
      "எக்ச்பென்சஸ்",
      "எக்ச்பென்ஸ்",
    ],
    "/products": [
      "பொருள்",
      "பொருட்கள்",
      "சாக்கு",
      "புரொடக்ட்ஸ்",
      "புரோடக்ட்ஸ்",
    ],
    "/calculations": [
      "கணக்கீடு",
      "கணக்கீடுகள்",
      "விலை",
      "கால்குலேட்டர்",
      "கால்குலேற்றர்",
    ],
    "/database": [
      "தரவு",
      "தரவுகள்",
      "களஞ்சியம்",
      "டேட்டபேஸ்",
      "தரவுத்தளம்",
    ],
    "/server": ["சர்வர்", "பின்னணி", "நிலை"],
    "/settings": [
      "அமைப்பு",
      "அமைப்புகள்",
      "விருப்பங்கள்",
      "செட்டிங்ஸ்",
      "செட்டிங்ஸ",
      "கட்டளைகள்",
    ],
    "/developer": ["டெவலப்பர்", "குறியீடு", "கோடு"],
  },
  hi: {
    "/": ["होम", "मुख्य पृष्ठ", "सारांश", "डैशबोर्ड"],
    "/reports": ["रिपोर्ट", "रिपोर्ट्स", "विश्लेषण", "आँकड़े", "विवरण"],
    "/sales": ["बिक्री", "बिक्रियाँ", "बिल", "ऑर्डर", "सेल्स", "बिक्रि"],
    "/expenses": ["खर्च", "खर्चे", "व्यय", "एक्सपेंस", "खर्चों"],
    "/products": ["उत्पाद", "उत्पादन", "सामान", "स्टॉक", "प्रोडक्ट्स", "प्रोडक्ट"],
    "/calculations": ["गणना", "हिसाब", "मूल्य", "कैलकुलेटर"],
    "/database": ["डेटाबेस", "डेटा", "रिकॉर्ड", "डेटाबेज", "डेटा बेस"],
    "/server": ["सर्वर", "बैकएंड", "स्थिति", "सर्वर"],
    "/settings": [
      "सेटिंग",
      "सेटिंग्स",
      "प्राथमिकताएँ",
      "विकल्प",
      "सेटिंगज",
    ],
    "/developer": ["डेवलपर", "कोड", "रिपॉज़िटरी", "डेवलपर"],
  },
  ml: {
    "/": ["ഹോം", "പ്രധാന പേജ്", "സാരാംശം", "ഡാഷ്ബോർഡ്"],
    "/reports": [
      "റിപ്പോർട്ട്",
      "റിപ്പോർട്ടുകൾ",
      "വിശകലനം",
      "റിപ്പോർട്ട്",
    ],
    "/sales": [
      "വിൽപ്പന",
      "വിൽപ്പനകൾ",
      "ബിൽ",
      "ഓർഡർ",
      "സെയ്ൽസ്",
      "വിൽപ്പന",
    ],
    "/expenses": [
      "ചെലവുകൾ",
      "ചെലവ്",
      "സംപദ",
      "എക്സ്പെൻസസ്",
      "ചെലവുകൾ",
    ],
    "/products": [
      "ഉൽപ്പന്നങ്ങൾ",
      "ഉൽപ്പന്നം",
      "സ്റ്റോക്ക്",
      "പ്രൊഡക്റ്റുകൾ",
      "പ്രൊഡക്റ്റ്",
    ],
    "/calculations": [
      "കണക്കുകൾ",
      "കണക്കൂട്",
      "വില",
      "കാൽക്കുലേറ്റർ",
      "കാൽക്കുലേറ്റർ",
    ],
    "/database": [
      "ഡാറ്റാബേസ്",
      "ഡാറ്റ",
      "രേഖകൾ",
      "ഡാറ്റബേസ്",
      "ഡാറ്റാ ബേസ്",
    ],
    "/server": ["സെർവർ", "ബാക്കെൻഡ്", "അവസ്ഥ"],
    "/settings": [
      "ക്രമീകരണങ്ങൾ",
      "സെറ്റിംഗ്",
      "സെറ്റിംഗ്സ്",
      "തിരഞ്ഞെടുപ്പുകൾ",
      "ക്രമീകരണങ്ങള്",
    ],
    "/developer": ["ഡെവലപ്പർ", "കോഡ്", "റിപ്പോസിറ്ററി"],
  },
};

/**
 * Words that carry no meaning on their own. Dropping them lets "the sales
 * page" count as the whole utterance while "what is the status" still does not.
 */
const FILLER = new Set([
  "a",
  "an",
  "the",
  "please",
  "page",
  "pages",
  "tab",
  "tabs",
  "section",
  "sections",
  "panel",
  "screen",
  "my",
  "our",
  "to",
  "for",
  "me",
  "now",
]);

/** The same, in the languages the app is written in. */
const LOCALIZED_FILLER: Record<string, string[]> = {
  ta: ["ஒரு", "என்ற", "பக்கம்", "பக்கங்கள்", "தாவலம்", "அமைப்பு", "தயவுசெய்து", "என்னை", "இப்போது"],
  hi: ["एक", "का", "की", "को", "पेज", "पेजों", "टैब", "सेक्शन", "कृपया", "अब", "मेरा"],
  ml: ["ഒരു", "ആ", "പേജ്", "പേജുകൾ", "ടാബ്", "വിഭാഗം", "ദയവച്ചിട്ട്", "ഇപ്പോൾ", "എന്റെ"],
};

/** Verbs that may introduce a command, making the page name free to float. */
const OPENERS = new Set([
  "go",
  "goto",
  "open",
  "show",
  "switch",
  "navigate",
  "display",
  "view",
  "see",
  "take",
  "bring",
  "pull",
  "jump",
  "find",
  "let",
  "lets",
]);

/** The same, in the languages the app is written in. */
const LOCALIZED_OPENERS: Record<string, string[]> = {
  ta: [
    "திற",
    "திறக்க",
    "திறவும்",
    "திறுங்கள்",
    "காட்டு",
    "காட்ட",
    "செல்",
    "செல்ல",
    "பார்",
    "பார்க்க",
    "வேண்டும்",
    "பண்ணு",
    "பண்ணுங்க",
    "செய்",
    "செய்யுங்கள்",
  ],
  hi: [
    "खोलो",
    "खोल",
    "खोलिए",
    "दिखाओ",
    "दिखा",
    "जाओ",
    "जा",
    "देखो",
    "देख",
    "चलो",
    "करो",
    "करें",
    "कीजिए",
  ],
  ml: [
    "തുറക്കു",
    "തുറക്കുക",
    "തുറന്നു",
    "കാണിക്കു",
    "കാണിക്കുക",
    "കാണിച്ചു",
    "പോയോ",
    "പോവ",
    "കാണുക",
    "ചെയ്യുക",
    "ചെയ്യൂ",
  ],
};

/**
 * Languages that say the verb last.
 *
 * "Open the settings" is "open … settings" in English, but "settings-ACC
 * open" in Tamil, Hindi and Malayalam — the page name comes first there.
 */
const VERB_FINAL = new Set(["ta", "hi", "ml"]);

export function words(text: string): string[] {
  return text
    .toLowerCase()
    /* Latin letters are not enough: the app is read in Tamil, Hindi and
       Malayalam too. Their vowel signs and viramas are combining marks
       rather than letters, so they have to be kept as well — dropping them
       would turn "सेटिंग" into "सटग" and "அமைப்புகள்" into "அமைப்பகள". */
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function unique(list: string[]): string[] {
  return [...new Set(list)];
}

/**
 * The words a command may be built from, in the language being spoken.
 */
export interface VoiceGrammar {
  candidates: VoiceCandidate[];
  fillers: Set<string>;
  openers: Set<string>;
  /**
   * True when the verb comes last rather than first.
   *
   * Tamil, Hindi and Malayalam put it at the end — "அமைப்புகளைத் திற" is
   * "settings-ACC open" — so the verb has to be looked for at the other end
   * of the sentence for the page name to be free to float.
   */
  verbFinal: boolean;
}

/**
 * The labels the commands are spoken and shown in.
 *
 * They come from the interface rather than from this file, so the microphone
 * says "விற்பனைகள்" when the app is in Tamil and "Sales" when it is in
 * English.
 */
export interface VoiceLabels {
  /** Page names, in the order they appear in the sidebar. */
  nav: { href: string; label: string }[];
  /** The three theme choices and their names. */
  theme: { mode: VoiceThemeMode; label: string; phrases: string[] }[];
  /** Refreshing the data. */
  refresh: { label: string; phrases: string[] };
  /** Ending the session. */
  stop: { label: string; phrases: string[] };
}

/**
 * The words for the commands that are not pages — the theme, refreshing the
 * data and stopping the session — said in the languages the app is written in.
 */
const LOCALIZED_ACTION_PHRASES: Record<
  string,
  { theme: Record<string, string[]>; refresh: string[]; stop: string[] }
> = {
  ta: {
    theme: {
      dark: ["இருள் தீம்", "இருள் பயன்முறை", "இருள்"],
      light: ["வெளிர் தீம்", "ஒளி பயன்முறை", "வெளிர்"],
      system: ["சிஸ்டம் தீம்", "தானியான பயன்முறை", "சிஸ்டம்"],
    },
    refresh: ["புதுப்பி", "புதுப்பிப்பு", "மீண்டும் ஏற்று", "திருப்பு"],
    stop: ["நிறுத்து", "நிறுத்தவும்", "வேண்டாம்", "ரத்து"],
  },
  hi: {
    theme: {
      dark: ["डार्क थीम", "डार्क मोड", "अंधेरा"],
      light: ["लाइट थीम", "लाइट मोड", "रोशनी"],
      system: ["सिस्टम थीम", "सिस्टम मोड", "सिस्टम"],
    },
    refresh: ["रिफ्रेश", "फिर से लोड करो", "ताजा करो"],
    stop: ["रोको", "बंद करो", "रद्द करो", "बस"],
  },
  ml: {
    theme: {
      dark: ["ഡാർക്ക് തീം", "ഇരുണ്ണ മോഡ്", "ഇരുണ്ണ"],
      light: ["ലൈറ്റ് തീം", "പ്രകാശ മോഡ്", "പ്രകാശം"],
      system: ["സിസ്റ്റം തീം", "സിസ്റ്റം മോഡ്", "സിസ്റ്റം"],
    },
    refresh: ["പുതുക്കുക", "വീണ്ടും ലോഡ് ചെയ്യുക", "റിഫ്രഷ് ചെയ്യുക"],
    stop: ["നിർത്തുക", "റദ്ദാക്കുക", "വേണ്ടാ"],
  },
};

/**
 * Builds the grammar for a language.
 *
 * The page names come from the interface in the reader's own language; the
 * words people use for them ("home", "முகப்பு") come from a table per
 * language. A language with no table of its own falls back to the English
 * words, which still work for anyone who knows them.
 */
export function buildGrammar(
  locale: string,
  labels: VoiceLabels,
  extra: VoiceCandidate[] = []
): VoiceGrammar {
  const language = locale.split("-")[0];
  const aliases = LOCALIZED_NAV_ALIASES[language] ?? {};
  const actions = LOCALIZED_ACTION_PHRASES[language];

  const navCandidates = labels.nav.flatMap((item) =>
    unique([item.label, ...(NAV_ALIASES[item.href] ?? []), ...(aliases[item.href] ?? [])]).map(
      (phrase) => ({
        phrase: words(phrase),
        action: { kind: "navigate", href: item.href, label: item.label } as VoiceAction,
      })
    )
  );

  const themeCandidates = labels.theme.flatMap((theme) =>
    unique([theme.label, ...theme.phrases, ...(actions?.theme[theme.mode] ?? [])]).map(
      (phrase) => ({
        phrase: words(phrase),
        action: { kind: "theme", mode: theme.mode, label: theme.label } as VoiceAction,
      })
    )
  );

  const extraCandidates = [
    ...unique([
      labels.refresh.label,
      ...labels.refresh.phrases,
      ...(actions?.refresh ?? []),
    ]).map((phrase) => ({
      phrase: words(phrase),
      action: { kind: "refresh", label: labels.refresh.label } as VoiceAction,
    })),
    ...unique([labels.stop.label, ...labels.stop.phrases, ...(actions?.stop ?? [])]).map(
      (phrase) => ({
        phrase: words(phrase),
        action: { kind: "stop", label: labels.stop.label } as VoiceAction,
      })
    ),
  ];

  return {
    candidates: [...navCandidates, ...themeCandidates, ...extraCandidates, ...extra].filter(
      (candidate) => candidate.phrase.length > 0
    ),
    fillers: new Set([...FILLER, ...(LOCALIZED_FILLER[language] ?? [])]),
    openers: new Set([...OPENERS, ...(LOCALIZED_OPENERS[language] ?? [])]),
    verbFinal: VERB_FINAL.has(language),
  };
}

/** Where `phrase` first appears as a run of whole words, or -1. */
function indexOfSequence(haystack: string[], needle: string[]): number {
  if (needle.length === 0 || needle.length > haystack.length) return -1;
  for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    let matched = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return i;
  }
  return -1;
}

/** Plain Levenshtein distance. Words are short, so the simple table is fine. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

export interface VoiceMatch {
  action: VoiceAction;
  /** 0–1. 1 means a label or alias was heard exactly. */
  score: number;
  /** The word or words that triggered it. */
  phrase: string;
  /** True when nothing had to be guessed. */
  exact: boolean;
}

/** At or above this the command is acted on; below it we ask first. */
export const AUTO_RUN_SCORE = 0.8;
/** Below this a candidate is not worth showing at all. */
const SUGGEST_SCORE = 0.55;

/**
 * How far apart two words may be and still count as the same word.
 *
 * Proportional distance is the wrong yardstick here: "stop" and "stock" are 60%
 * alike yet mean nothing to each other, while "expen" and "expenses" are only
 * 75% alike and plainly the same word. So the budget scales with length, and
 * short words — where a single stray letter changes everything — get almost
 * none.
 */
function allowWithin(a: string, b: string): number {
  if (Math.min(a.length, b.length) <= 4) return 1;
  return Math.max(a.length, b.length) <= 8 ? 2 : 3;
}

/**
 * How close an utterance is to `phrase`.
 *
 * `anywhere` is true when the sentence opens with a verb, which lets the phrase
 * sit anywhere in it. Without that, the utterance has to be the phrase and
 * nothing else — otherwise "what is the status" would match Server, and every
 * stray word would switch pages.
 */
function fuzzyScore(phrase: string[], words: string[], anywhere: boolean): number {
  if (words.length === 0 || phrase.length === 0) return 0;

  if (!anywhere && words.length !== phrase.length) return 0;

  let best = 0;
  const last = anywhere ? words.length - phrase.length : 0;
  for (let i = 0; i <= last; i += 1) {
    let distance = 0;
    let longest = 0;
    let withinBudget = true;
    for (let j = 0; j < phrase.length; j += 1) {
      const heard = words[i + j];
      const wanted = phrase[j];
      const gap = editDistance(heard, wanted);
      if (gap > allowWithin(heard, wanted)) {
        withinBudget = false;
        break;
      }
      distance += gap;
      longest += Math.max(heard.length, wanted.length);
    }
    if (withinBudget && longest > 0) best = Math.max(best, 1 - distance / longest);
  }
  // Rounded so a near-miss lands on the same value the panel prints, and so the
  // auto-run cut-off is not a coin toss on floating-point noise.
  return Math.round(best * 1000) / 1000;
}

function scoreCandidate(
  candidate: VoiceCandidate,
  heard: string[],
  bare: string[],
  opens: boolean
): { score: number; exact: boolean } | null {
  /* Said word for word, it is the command — even when one of the words is
     also a filler word. "Next page" is a command; "the sales page" is a
     sentence. */
  const exactly =
    heard.length === candidate.phrase.length &&
    candidate.phrase.every((word, index) => heard[index] === word);
  if (exactly) return { score: 1, exact: true };

  if (indexOfSequence(heard, candidate.phrase) !== -1) {
    const wholeUtterance =
      bare.length === candidate.phrase.length &&
      candidate.phrase.every((word, index) => bare[index] === word);
    if (wholeUtterance || opens) return { score: 1, exact: true };
  }

  const fuzzy = fuzzyScore(candidate.phrase, opens ? heard : bare, opens);
  return fuzzy > 0 ? { score: fuzzy, exact: false } : null;
}

function actionKey(action: VoiceAction): string {
  if (action.kind === "navigate") return `nav:${action.href}`;
  if (action.kind === "theme") return `theme:${action.mode}`;
  if (action.kind === "op") return `op:${action.id}`;
  return action.kind;
}

/**
 * Whether a word opens a command.
 *
 * The languages that put the verb last glue endings onto it — "திற" becomes
 * "திறக்குங்கள்", "തുറക്കു" becomes "തുറക്കുക" — so a word counts when it
 * *begins* with one of the verbs as well as when it is exactly one.
 */
function isOpener(word: string, openers: Set<string>): boolean {
  if (openers.has(word)) return true;
  for (const opener of openers) {
    if (opener.length >= 2 && word.startsWith(opener)) return true;
  }
  return false;
}

/**
 * Every command the utterance could plausibly mean, best first.
 *
 * Speech recognition is approximate, so this scores rather than filters: a hit
 * on a label or alias is 1, a near-miss on the spelling scores lower, and the
 * caller decides whether the result is good enough to act on unasked.
 *
 * `grammar` carries the words of the language being spoken — the page names,
 * the filler words and the verbs that introduce a command. `extra` carries
 * the commands the current page has registered — operations such as "new sale"
 * or "save settings" that only exist where they apply.
 */
export interface SuggestOptions {
  /** The grammar of the language being spoken. */
  grammar?: VoiceGrammar;
  /** Page-registered commands, as candidates. */
  extra?: VoiceCandidate[];
  limit?: number;
}

export function suggestVoiceCommands(
  transcript: string,
  { grammar, extra = [], limit = 4 }: SuggestOptions = {}
): VoiceMatch[] {
  const heard = words(transcript);
  if (heard.length === 0) return [];

  const candidates = grammar?.candidates ?? [];
  if (!candidates.length) return [];

  const fillers = grammar?.fillers ?? FILLER;
  const openers = grammar?.openers ?? OPENERS;
  const verbFinal = grammar?.verbFinal ?? false;

  const bare = heard.filter((word) => !fillers.has(word));
  /* The verb introduces the command, which lets the page name sit anywhere in
     the sentence. English puts it first; Tamil, Hindi and Malayalam put it
     last — and a sentence may borrow the English verb in the middle, as in
     "செட்டிங்ஸ் ஓப்பன் பண்ணுங்க". */
  const opens = verbFinal
    ? heard.some((word) => isOpener(word, openers))
    : openers.has(heard[0]);

  const best = new Map<string, VoiceMatch>();
  for (const candidate of extra.length ? [...candidates, ...extra] : candidates) {
    const outcome = scoreCandidate(candidate, heard, bare, opens);
    if (!outcome || outcome.score < SUGGEST_SCORE) continue;

    const key = actionKey(candidate.action);
    const match: VoiceMatch = {
      action: candidate.action,
      score: outcome.score,
      phrase: candidate.phrase.join(" "),
      exact: outcome.exact,
    };
    const current = best.get(key);
    if (!current || match.score > current.score) best.set(key, match);
  }

  return [...best.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        // Same confidence: the shorter, more specific phrase wins, then
        // alphabetical order keeps the list stable between runs.
        a.phrase.length - b.phrase.length ||
        a.phrase.localeCompare(b.phrase)
    )
    .slice(0, limit);
}

/** The best command across several readings of the same utterance. */
export function bestVoiceMatch(
  transcripts: string[],
  { grammar, extra = [], limit = 4 }: SuggestOptions = {}
): VoiceMatch[] {
  const best = new Map<string, VoiceMatch>();
  for (const transcript of transcripts) {
    for (const match of suggestVoiceCommands(transcript, { grammar, extra, limit })) {
      const key = actionKey(match.action);
      const current = best.get(key);
      if (!current || match.score > current.score) best.set(key, match);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ------------------------------------------------------------------ speech */

export interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

export interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

/**
 * The subset of the Web Speech API this app uses. Declared here rather than
 * relying on `lib.dom`, which does not carry these across every TypeScript
 * version, and because Chrome still ships them prefixed.
 */
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

/** One result of the recogniser, with its readings. */
export interface SpeechResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: { transcript: string };
}

/**
 * The words of the results that have not been taken yet.
 *
 * The recogniser hands over everything from `fromIndex` onwards, including
 * results it has already finalised — and it does that more than once. A
 * result is taken once, so one utterance runs one command.
 *
 * `lastFinal` is the index of the last result taken; the new one is handed
 * back so the caller can remember it.
 */
export function collectSpeech(
  results: { length: number; [index: number]: SpeechResultLike },
  fromIndex: number,
  lastFinal: number
): { text: string; readings: string[]; lastFinal: number } {
  let text = "";
  let readings: string[] = [];
  let final = lastFinal;

  for (let index = fromIndex; index < results.length; index += 1) {
    const result = results[index];
    if (!result.isFinal) continue;
    if (index <= final) continue;
    final = index;

    text += result[0]?.transcript ?? "";

    // The recogniser's own runner-up readings, best first.
    const others: string[] = [];
    for (let a = 0; a < result.length; a += 1) {
      const other = result[a]?.transcript?.trim();
      if (other) others.push(other);
    }
    if (others.length) readings = others;
  }

  return { text, readings, lastFinal: final };
}

/** Chrome and Edge expose this; Firefox and Safari do not (as of writing). */
export function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/* ---------------------------------------------------------------- language */

/**
 * The words that introduce a search, in the languages the app is written in.
 *
 * English puts the verb first ("search for Asha"); Tamil, Hindi and Malayalam
 * put it last ("Asha தேடு"). The search word is taken out wherever it sits.
 */
const SEARCH_WORDS: Record<string, string[]> = {
  en: ["search for", "look for", "search", "find"],
  ta: ["தேடு", "தேடி", "தேடுக"],
  hi: ["खोजो", "खोजें", "ढूंढो", "ढूंढिए"],
  ml: ["തിരയുക", "തിരയ്ക്കുക", "കണ്ടെടുക്കുക"],
};

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Takes the search word out of what was said, and hands back the rest.
 *
 * What is left is what to look for: "search for Asha" gives "Asha", and
 * "Asha தேடு" gives "Asha" too.
 *
 * Malayalam writes its polite form with a chillu on the end — "തിരയുക്"
 * rather than "തിരയുക" — so the chillu is allowed to follow the word.
 */
export function searchTerm(spoken: string, language: string): string {
  let text = spoken.trim();
  for (const word of SEARCH_WORDS[language] ?? SEARCH_WORDS.en) {
    const pattern = new RegExp(`(^|\\s)${escapePattern(word)}\\u0D4D?(\\s|$)`, "i");
    text = text.replace(pattern, " ").replace(/\s+/g, " ").trim();
  }
  return text;
}

export interface VoiceLanguage {
  /** The accent the recogniser expects, e.g. `ta-IN`. */
  value: string;
  /** The name of the language in English. */
  label: string;
  /** The name of the language in that language. */
  native: string;
  /** The language code the translations are written in, e.g. `ta`. */
  locale: string;
}

/**
 * The accent the recogniser should expect. This is the single biggest accuracy
 * lever: Chrome picks its acoustic model from this tag, so an Indian-English
 * speaker gets noticeably better results from `en-IN` than the browser's
 * default `en-US`.
 */
export const VOICE_LANGUAGES: VoiceLanguage[] = [
  { value: "en-IN", label: "English (India)", native: "English", locale: "en" },
  { value: "en-GB", label: "English (UK)", native: "English", locale: "en" },
  { value: "en-US", label: "English (US)", native: "English", locale: "en" },
  { value: "hi-IN", label: "Hindi", native: "हिन्दी", locale: "hi" },
  { value: "ta-IN", label: "Tamil", native: "தமிழ்", locale: "ta" },
  { value: "ml-IN", label: "Malayalam", native: "മലയാളം", locale: "ml" },
];

/** The shop is Indian, so Indian English is the sensible starting point. */
export const DEFAULT_VOICE_LANGUAGE = "en-IN";

/**
 * The language the assistant listens and speaks in.
 *
 * The reader may choose one, or leave it to the language of the interface.
 * Either way it is the language of the whole voice conversation: the words the
 * microphone expects, the words the assistant replies with, and the grammar
 * that turns one into the other.
 */
export function voiceLocale(language: string, appLocale: string): string {
  if (!language) return appLocale;
  const entry = VOICE_LANGUAGES.find((option) => option.value === language);
  if (!entry) return appLocale;
  /* English comes in three accents; they are all the same language. */
  return entry.locale;
}

/** The accent the recogniser and the voice should use. */
export function voiceAccent(language: string, appAccent: string): string {
  return language || appAccent;
}

const LANGUAGE_KEY = "music.voice.language";
const LANGUAGE_EVENT = "music:voice-language";

/**
 * The accent the reader has asked the recogniser to expect.
 *
 * An empty string means "whatever the interface is in" — the recogniser then
 * follows the language of the app, which is right far more often than not.
 */
export function readVoiceLanguage(): string {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_KEY);
    if (stored === "") return "";
    if (stored && VOICE_LANGUAGES.some((entry) => entry.value === stored)) return stored;
  } catch {
    /* storage can be unavailable in private mode */
  }
  return "";
}

export function readVoiceLanguageOnServer(): string {
  return "";
}

export function setVoiceLanguage(value: string): void {
  try {
    window.localStorage.setItem(LANGUAGE_KEY, value);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(LANGUAGE_EVENT));
}

export function subscribeVoiceLanguage(onChange: () => void): () => void {
  window.addEventListener(LANGUAGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(LANGUAGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
