import type { Song } from "@/lib/saavn";

/**
 * The "why am I listening" filter — a row of vibes under the header. Picking
 * one (or several) re-tunes the catalogue queries; the page then ranks the
 * pooled results so the vibe-fitting songs lead and the list never runs
 * empty while something scrollable exists.
 */
export interface Vibe {
  /** Value used in state / keys. */
  value: string;
  /** Chip label. */
  label: string;
  /** Search angles — several words sets per vibe, tried in order. */
  queries: string[];
  /** Words that qualify a song's title / artist / album for this vibe. */
  match: string[];
}

export const VIBES: Vibe[] = [
  {
    value: "party",
    label: "Party",
    queries: ["party songs", "dance hits", "remix dance"],
    match: ["party", "dance", "dj", "remix", "celebr", "gala", "thillana"],
  },
  {
    value: "travel",
    label: "Bus & travel",
    queries: ["bus travel songs", "journey road songs", "yatra payanam"],
    match: [
      "bus", "train", "travel", "journey", "auto", "rail", "ride", "highway",
      "road", "yatra", "prayanam", "payanam", "sapadham", "kathal",
    ],
  },
  {
    value: "background",
    label: "Background",
    queries: ["instrumental bgm", "background theme songs", "lofi ambient"],
    match: ["bgm", "instrumental", "theme", "background", "ambience", "score"],
  },
  {
    value: "sleep",
    label: "Sleep",
    queries: ["sleep songs", "lofi sleep night", "calm lullaby"],
    match: ["sleep", "lofi", "chill", "calm", "relax", "lullaby", "night", "thookam", "moon"],
  },
  {
    value: "devotional",
    label: "Devotional",
    queries: ["devotional bhajan", "bhakti songs", "aarti mantra"],
    match: [
      "bhajan", "aarti", "mantra", "devi", "krishna", "rama", "shiva", "ganesh",
      "temple", "sloka", "devotional", "bakthi", "bhakti", "suprabhatham", "hare",
    ],
  },
  {
    value: "romantic",
    label: "Romantic",
    queries: ["romantic love songs", "love melody songs", "duet love"],
    match: ["love", "romantic", "pyaar", "kadhal", "heart", "ishq", "sneham", "madanam"],
  },
  {
    value: "workout",
    label: "Workout",
    queries: ["workout gym songs", "high energy songs", "beast mode"],
    match: ["workout", "gym", "run", "energy", "power", "beast", "pump", "sprint"],
  },
  {
    value: "sad",
    label: "Sad",
    queries: ["sad songs", "alone songs", "breakup songs"],
    match: ["sad", "alone", "breakup", "pain", "lonely", "tear", "viraham", "dard"],
  },
  {
    value: "folk",
    label: "Folk",
    queries: ["naadan paattu", "folk songs", "village songs"],
    match: ["folk", "nadan", "naattu", "gramath", "village", "tribal", "desath"],
  },
  {
    value: "classical",
    label: "Classical",
    queries: ["classical songs", "carnatic instrumental", "raga fusion"],
    match: ["raga", "carnatic", "hindustani", "sitar", "veena", "classical", "tuppan"],
  },
];

/**
 * True when a song's words carry any of the vibe markers — the primary score
 * input that pushes matching songs to the top of the page.
 */
export function matchesVibe(song: Song, vibe: Vibe): boolean {
  const text = `${song.title} ${song.artist} ${song.album} ${song.language}`.toLowerCase();
  return vibe.match.some((keyword) => text.includes(keyword));
}

/**
 * True when a song's metadata language names one of the selected regions —
 * the second score input that keeps the mix anchored to the right languages.
 */
export function matchesRegions(song: Song, regionLabels: string[]): boolean {
  const language = song.language.toLowerCase();
  return regionLabels.some((label) => language.includes(label.toLowerCase()));
}
