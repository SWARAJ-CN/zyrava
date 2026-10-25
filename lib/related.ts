import { VIBES, matchesVibe } from "@/components/features/music/filters";
import { dedupeSongs, type Song } from "@/lib/saavn";

/* ------------------------------------------------------------------ *
 * Content-based "sounds like" engine.
 *
 * The catalogue has no listening graph to learn from, so similarity is
 * computed from what every track does carry — title, artist, album,
 * language, year, runtime and the app's own vibe taxonomy. Each song is
 * turned into a profile and every profile dimension becomes a 0..1 term;
 * the weighted sum is the similarity, and picks go through an MMR pass so
 * the run stays varied instead of ten copies of one artist.
 * ------------------------------------------------------------------ */

/** Words that describe packaging, not music — ignored when matching text. */
const NOISE = new Set([
  "song", "songs", "track", "official", "audio", "video", "lyrical", "lyrics",
  "lyricial", "visualizer", "full", "hd", "hdv", "mp3", "jpac", "ktv", "featuring",
  "feat", "ft", "with", "from", "the", "and", "a", "an", "of", "new", "v2", "v3",
]);

/** Weight of each similarity term; the sum is 1, so the score stays 0..1. */
const WEIGHTS = {
  artist: 0.3,
  mood: 0.18,
  album: 0.14,
  title: 0.12,
  language: 0.12,
  era: 0.08,
  length: 0.06,
};

/** A candidate earns this per seed that surfaced it high up, as evidence. */
const EVIDENCE_BONUS = 0.03;
/** Flat bonus when the artist is already in the listener's own library. */
const TASTE_BONUS = 0.05;

/** MMR trade-off: 1 is pure relevance, 0 is pure diversity. */
const LAMBDA = 0.74;

/** Title overlap at which a track counts as another cut of the seed itself. */
const TITLE_ECHO = 0.6;

export function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Meaningful words of a text field; bracketed packaging notes are dropped. */
export function tokenize(value: string): string[] {
  return normalize(value)
    .replace(/\([^)]*\)|\[[^\]]*]/g, " ")
    .split(/[^\p{L}\p{N}]+/gu)
    .filter((word) => word.length > 1 && !NOISE.has(word));
}

function toSet(words: string[]): Set<string> {
  return new Set(words);
}

/** The title without its bracketed packaging notes — the repeat guard's key. */
function baseTitle(song: Song): string {
  const words = tokenize(song.title);
  return words.length ? words.join(" ") : normalize(song.title);
}

/** Sørensen–Dice overlap: 1 for identical sets, 0 for disjoint ones. */
export function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

function intersect(a: Set<string>, b: Set<string>): number {
  let hits = 0;
  for (const word of a) if (b.has(word)) hits += 1;
  return hits;
}

function yearOf(song: Song): number {
  const parsed = Number.parseInt(song.year ?? "", 10);
  return Number.isFinite(parsed) && parsed > 1900 ? parsed : 0;
}

/**
 * One song as the engine sees it: word sets per field, the language/era/length
 * scalars and a mood vector over the app's vibe taxonomy.
 */
export interface Profile {
  song: Song;
  title: Set<string>;
  artist: Set<string>;
  album: Set<string>;
  language: string;
  year: number;
  duration: number;
  mood: number[];
}

export function profileOf(song: Song): Profile {
  const text = normalize(
    `${song.title} ${song.artist} ${song.album} ${song.language}`
  );
  /* Each vibe contributes how strongly its own vocabulary shows up in the
   * track; dividing by the vector length makes the comparison directional
   * (cosine), so a busy song is not "more romantic" just because it is wordy. */
  const raw = VIBES.map((vibe) => {
    if (!vibe.match.some((keyword) => text.includes(keyword))) return 0;
    const hits = vibe.match.reduce(
      (count, keyword) => count + (text.includes(keyword) ? 1 : 0),
      0
    );
    return hits;
  });
  const magnitude = Math.sqrt(raw.reduce((sum, value) => sum + value * value, 0));

  return {
    song,
    title: toSet(tokenize(song.title)),
    artist: toSet(tokenize(song.artist)),
    album: toSet(tokenize(song.album)),
    language: normalize(song.language),
    year: yearOf(song),
    duration: song.duration || 0,
    mood: magnitude ? raw.map((value) => value / magnitude) : raw,
  };
}

export function cosine(a: number[], b: number[]): number {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += a[index] * b[index];
  return Math.min(1, Math.max(0, sum));
}

/** Every dimension of how alike two tracks are, kept separate for the label. */
export interface SimilarityBreakdown {
  artist: number;
  album: number;
  title: number;
  language: number;
  mood: number;
  era: number;
  length: number;
}

export interface RelatedPick {
  song: Song;
  /** Final ranking score (similarity plus evidence and taste bonuses). */
  score: number;
  /** Plain-English "why this one", from the strongest contributing term. */
  reason: string;
}

/**
 * Weighted similarity between two profiles: 1 is the same recording, 0 shares
 * nothing the catalogue knows about.
 */
export function breakdown(a: Profile, b: Profile): SimilarityBreakdown {
  const sameLanguage = a.language && b.language ? (a.language === b.language ? 1 : 0) : 0;

  // Absent metadata stays neutral instead of dragging the score to zero.
  const era =
    a.year && b.year ? Math.max(0, 1 - Math.abs(a.year - b.year) / 25) : sameLanguage;
  const length =
    a.duration && b.duration
      ? Math.exp(-Math.abs(a.duration - b.duration) / 90)
      : sameLanguage;

  return {
    artist: overlap(a.artist, b.artist),
    album: a.album.size && b.album.size ? overlap(a.album, b.album) : 0,
    title: overlap(a.title, b.title),
    language: sameLanguage,
    mood: cosine(a.mood, b.mood),
    era,
    length,
  };
}

export function similarity(a: Profile, b: Profile): number {
  const parts = breakdown(a, b);
  return (
    WEIGHTS.artist * parts.artist +
    WEIGHTS.mood * parts.mood +
    WEIGHTS.album * parts.album +
    WEIGHTS.title * parts.title +
    WEIGHTS.language * parts.language +
    WEIGHTS.era * parts.era +
    WEIGHTS.length * parts.length
  );
}

function strongestReason(parts: SimilarityBreakdown): string {
  // Judged on what each term actually contributed to the score, so an exact
  // language match never outranks a shared artist.
  const contributions: Array<[string, number]> = [
    ["Same artist", WEIGHTS.artist * parts.artist],
    ["Same album", WEIGHTS.album * parts.album],
    ["Similar mood", WEIGHTS.mood * parts.mood],
    ["Same language", WEIGHTS.language * parts.language],
    ["Similar title", WEIGHTS.title * parts.title],
    ["Same era", WEIGHTS.era * parts.era],
    ["Similar length", WEIGHTS.length * parts.length],
  ];
  const [label, value] = contributions.reduce((best, entry) =>
    entry[1] > best[1] ? entry : best
  );
  return value >= 0.05 ? label : "Sounds similar";
}

/** The seed itself, or another cut of it — never a "related" result. */
export function isSameRecording(a: Profile, b: Profile): boolean {
  return (
    a.song.id === b.song.id ||
    (overlap(a.title, b.title) >= 0.75 && (overlap(a.artist, b.artist) >= 0.5 || a.album.size === 0))
  );
}

/**
 * Search phrases that pull up a neighbourhood around one track: its artists,
 * its album, the title's own words, then the language plus the dominant vibe.
 * Earlier seeds are stronger evidence, so a candidate found by several of them
 * floats up.
 */
export function relatedSeeds(song: Song): string[] {
  const profile = profileOf(song);
  const seeds: string[] = [];

  const artistWords = [...profile.artist].slice(0, 3).join(" ");
  if (artistWords) seeds.push(artistWords);

  const albumWords = [...profile.album].slice(0, 4).join(" ");
  if (albumWords.length > 3) seeds.push(albumWords);

  const titleWords = [...profile.title].slice(0, 3).join(" ");
  if (titleWords) seeds.push(titleWords);

  const language = song.language.trim();
  if (language) {
    const vibe = VIBES.find((candidate) => matchesVibe(song, candidate));
    seeds.push(vibe ? `${language} ${vibe.queries[0]}` : `${language} hits`);
  }

  // Unique, trimmed, and never more than four round trips.
  return [...new Set(seeds.map((seed) => seed.trim()).filter(Boolean))].slice(0, 4);
}

export interface RelatedInput {
  /** Candidate pool, in seed order — repeats across seeds become evidence. */
  pool: Array<{ song: Song; seedRank: number }>;
  limit?: number;
  /** Max tracks per artist in the run. */
  artistCap?: number;
  /** Artist word sets the listener has already liked, as a taste signal. */
  taste?: Set<string>;
  /** Alternate cuts of the seed's own title (covers, remixes) worth keeping. */
  titleClones?: number;
}

/** One candidate as the diversifier sees it: a track, its profile, its rank. */
export interface MmrItem {
  song: Song;
  profile: Profile;
  /** Ranking score before diversification — what MMR trades against novelty. */
  raw: number;
  /** How much of the seed's own title this track repeats. */
  echo?: number;
}

export interface MmrOptions {
  limit?: number;
  /** Max tracks per artist in the run. */
  artistCap?: number;
  /** Alternate cuts of the seed title worth keeping. */
  titleClones?: number;
}

/**
 * Greedy MMR: repeatedly take the candidate with the best trade-off between
 * its own score and how redundant it is against what is already chosen, so a
 * run reads as a scene rather than one artist's discography. A candidate that
 * breaks the artist cap, repeats a title or overflows the clone budget is
 * discounted rather than dropped, so a short list still fills.
 */
export function mmrSelect<T extends MmrItem>(candidates: T[], options: MmrOptions = {}): T[] {
  const { limit = 10, artistCap = 2, titleClones = 1 } = options;
  const picks: T[] = [];
  const perArtist = new Map<string, number>();
  const seenTitles = new Set<string>();
  const remaining = [...candidates];
  let clones = 0;

  while (picks.length < limit && remaining.length) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const artistKey = normalize(candidate.song.artist);
      const blocked =
        (perArtist.get(artistKey) ?? 0) >= artistCap ||
        seenTitles.has(baseTitle(candidate.song)) ||
        ((candidate.echo ?? 0) >= TITLE_ECHO && clones >= titleClones);
      // Redundancy = how similar it is to the closest track already chosen.
      let redundancy = 0;
      for (const picked of picks) {
        redundancy = Math.max(redundancy, similarity(candidate.profile, picked.profile));
      }
      const value = LAMBDA * candidate.raw - (1 - LAMBDA) * redundancy - (blocked ? 1 : 0);
      if (value > bestValue) {
        bestValue = value;
        bestIndex = index;
      }
    }
    const [chosen] = remaining.splice(bestIndex, 1);
    if (!chosen) break;
    const artistKey = normalize(chosen.song.artist);
    perArtist.set(artistKey, (perArtist.get(artistKey) ?? 0) + 1);
    seenTitles.add(baseTitle(chosen.song));
    if ((chosen.echo ?? 0) >= TITLE_ECHO) clones += 1;
    picks.push(chosen);
  }

  return picks;
}

/**
 * Ranks the pool against `seed`: similarity, plus a bonus per seed that
 * surfaced the track, plus a flat taste bonus when the artist is already in
 * the library. Survivors then go through the diversifier.
 */
export function rankRelated(seedSong: Song, input: RelatedInput): RelatedPick[] {
  const { pool, limit = 10, artistCap = 2, taste, titleClones = 1 } = input;
  const seed = profileOf(seedSong);

  /** How many seeds surfaced this recording, and how high they placed it. */
  const evidence = new Map<string, number>();
  const unique = dedupeSongs(pool.map((entry) => entry.song)).filter(
    (song) => song.id !== seedSong.id
  );
  const keepable = new Set(unique.map((song) => song.id));

  for (const entry of pool) {
    if (!keepable.has(entry.song.id)) continue;
    const strength = 1 + Math.max(0, 8 - entry.seedRank) / 8;
    evidence.set(entry.song.id, (evidence.get(entry.song.id) ?? 0) + strength);
  }

  const profiles = unique.map((song) => profileOf(song));
  const scored = profiles
    .filter((profile) => !isSameRecording(seed, profile))
    .map((profile) => {
      const parts = breakdown(seed, profile);
      const raw = similarity(seed, profile);
      const hits = Math.max(0, (evidence.get(profile.song.id) ?? 1) - 1);
      const tasteHit = taste && intersect(taste, profile.artist) > 0 ? TASTE_BONUS : 0;
      return {
        song: profile.song,
        profile,
        raw,
        score: Math.min(1, raw + hits * EVIDENCE_BONUS + tasteHit),
        reason: strongestReason(parts),
        // How much of the seed's own title this track repeats.
        echo: parts.title,
      };
    })
    .sort((a, b) => b.score - a.score);

  const picks = mmrSelect(scored, { limit, artistCap, titleClones });

  return picks.map(({ song, score, reason }) => ({ song, score, reason }));
}

/** Artist word sets across a listener's library — the taste input for ranking. */
export function tasteProfile(songs: Song[]): Set<string> {
  const words = new Set<string>();
  for (const song of songs) for (const word of tokenize(song.artist)) words.add(word);
  return words;
}
