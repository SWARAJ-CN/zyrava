/*
 * lrclib.net — where lyrics come from.
 *
 * The catalogue is JioSaavn, whose own lyrics API is signed and not reachable,
 * so this app asks a community lyrics database instead. lrclib is keyless and
 * CORS-open, but it rate limits per IP and every listener shares this server's
 * address, so the whole design here is in service of asking as rarely as
 * possible: a long-lived cache, one in-flight lookup per song, and a circuit
 * breaker so an hour of users cannot stampede a service that is already down.
 *
 * Server-side only. Nothing in here may be imported by a component — the cache
 * would become per-browser and the rate limit would be discovered the hard way.
 */

import {
  artistCredits,
  normalizeText,
  parseLrc,
  plainToStanzas,
  type LyricsMatch,
  type LyricsResult,
  type LyricsSeed,
} from "@/lib/lyrics";

const BASE = "https://lrclib.net/api";
const TIMEOUT_MS = 8000;

/* lrclib asks that a client identify itself; no key is involved. */
const USER_AGENT = "ZYRAVA/0.1 (now-playing lyrics lookup)";

/** A candidate is only inspected in bulk; twenty is plenty. */
const MAX_CANDIDATES = 20;

/** Lyrics do not change. A miss might, so it heals sooner. */
const HIT_TTL = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL = 6 * 60 * 60 * 1000;
/** Long enough to protect the shared IP, short enough that a blip recovers. */
const FAIL_TTL = 60 * 1000;
const MAX_ENTRIES = 500;

export interface LyricCandidate {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  hasWordSync: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export type LyricsOutcome =
  | { status: "found"; result: LyricsResult }
  | { status: "none"; reason: "none" | "instrumental" };

/** A real failure, as opposed to the provider's answer of "not in here". */
export class LyricsUpstreamError extends Error {
  readonly status: 429 | 502;

  constructor(message: string, status: 429 | 502) {
    super(message);
    this.name = "LyricsUpstreamError";
    this.status = status;
  }
}

type Entry =
  | { at: number; outcome: LyricsOutcome }
  | { at: number; failed: true };

const cache = new Map<string, Entry>();
const pending = new Map<string, Promise<LyricsOutcome>>();

/**
 * Title, first two credits and the runtime. Deliberately not the album: two
 * encodes of one master must share a key, and a reissue spelling must not
 * cause a second question to lrclib.
 */
function seedKey(seed: LyricsSeed): string {
  return [
    normalizeText(seed.title),
    artistCredits(seed.artist).slice(0, 2).join(","),
    Math.round(seed.duration || 0),
  ].join("|");
}

function tokens(value: string): string[] {
  return normalizeText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** 1 identical, 0 unrelated; packaging notes in brackets are already gone. */
function titleSimilarity(wanted: string, offered: string): number {
  const a = normalizeText(wanted);
  const b = normalizeText(offered);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.startsWith(b) || b.startsWith(a) || a.includes(b) || b.includes(a)) return 0.7;

  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return (0.5 * (2 * shared)) / (left.size + right.size);
}

/**
 * The overlap coefficient, not Jaccard: one recording is credited to "Pritam,
 * Arijit Singh, Amitabh Bhattacharya" by some sources and to just "Pritam" by
 * others, and a ratio that penalises the missing names would rank the right
 * answer below a different song by the same lead artist.
 */
function artistSimilarity(wanted: string, offered: string): number {
  const left = artistCredits(wanted);
  const right = new Set(artistCredits(offered));
  if (!left.length || !right.size) return 0;
  let shared = 0;
  for (const credit of left) if (right.has(credit)) shared += 1;
  return shared / Math.min(left.length, right.size);
}

function durationSimilarity(seed: LyricsSeed, candidate: LyricCandidate): number {
  if (!seed.duration || !candidate.duration) return 0.5;
  const delta = Math.abs(candidate.duration - seed.duration);
  // Never a hard gate — lrclib carries 268s, 269s, 257s and 240s versions of a
  // track the catalogue calls 180s, and gating on it is what makes misses.
  if (delta <= 3) return 1;
  if (delta <= 10) return 0.6;
  if (delta <= 30) return 0.25;
  return 0;
}

/** Usable candidates score above 0; a wrong song scores exactly 0. */
export function scoreCandidate(seed: LyricsSeed, candidate: LyricCandidate): number {
  const title = titleSimilarity(seed.title, candidate.trackName);
  const artist = artistSimilarity(seed.artist, candidate.artistName);
  if (!title || !artist) return 0;
  if (!candidate.syncedLyrics && !candidate.plainLyrics) return 0;

  let score = title * 0.45 + artist * 0.35 + durationSimilarity(seed, candidate) * 0.2;
  if (candidate.syncedLyrics) score += 0.5;
  else score += 0.05;
  if (normalizeText(seed.album) && normalizeText(seed.album) === normalizeText(candidate.albumName)) {
    score += 0.15;
  }
  if (candidate.instrumental) score -= 0.5;
  return score;
}

/**
 * Best content, not best luck: lrclib's own ordering puts a lofi flip and the
 * album master next to each other, so identical words are collapsed first and
 * the higher-scoring copy survives.
 */
export function pickBest(
  seed: LyricsSeed,
  candidates: LyricCandidate[]
): LyricCandidate | null {
  const seen = new Map<string, { candidate: LyricCandidate; score: number }>();

  for (const candidate of candidates.slice(0, MAX_CANDIDATES)) {
    const score = scoreCandidate(seed, candidate);
    if (score <= 0) continue;
    const fingerprint = (candidate.syncedLyrics || candidate.plainLyrics || "")
      .slice(0, 120)
      .trim();
    const previous = seen.get(fingerprint);
    if (!previous || previous.score < score) seen.set(fingerprint, { candidate, score });
  }

  let best: LyricCandidate | null = null;
  let bestScore = 0;
  for (const entry of seen.values()) {
    if (entry.score > bestScore) {
      bestScore = entry.score;
      best = entry.candidate;
    }
  }
  return best;
}

/**
 * One candidate, one result. `null` means it carried no words at all.
 *
 * When the two runtimes agree it is the same master and the catalogue's length
 * is the honest bound on the timing map; when they disagree the provider's own
 * length is the only self-consistent one, and the user is told sync may drift.
 */
export function toResult(seed: LyricsSeed, candidate: LyricCandidate): LyricsResult | null {
  const matched: LyricsMatch = {
    trackName: candidate.trackName,
    artistName: candidate.artistName,
    albumName: candidate.albumName,
    duration: candidate.duration,
  };
  const drift =
    Boolean(seed.duration) && Math.abs((candidate.duration || 0) - seed.duration) > 5;
  const ceiling = drift || !seed.duration ? candidate.duration : seed.duration;

  if (candidate.syncedLyrics) {
    const lines = parseLrc(candidate.syncedLyrics, ceiling || undefined);
    if (lines.length >= 2) return { body: { kind: "timed", lines }, matched, drift };
  }

  const stanzas = plainToStanzas(candidate.plainLyrics ?? "");
  if (!stanzas.length) return null;
  return { body: { kind: "plain", stanzas }, matched, drift };
}

function asCandidate(value: unknown): LyricCandidate | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.trackName !== "string" || typeof raw.artistName !== "string") return null;
  return {
    id: Number(raw.id) || 0,
    trackName: raw.trackName,
    artistName: raw.artistName,
    albumName: typeof raw.albumName === "string" ? raw.albumName : "",
    duration: Number(raw.duration) || 0,
    instrumental: Boolean(raw.instrumental),
    hasWordSync: Boolean(raw.hasWordSync),
    plainLyrics: typeof raw.plainLyrics === "string" && raw.plainLyrics.trim() ? raw.plainLyrics : null,
    syncedLyrics:
      typeof raw.syncedLyrics === "string" && raw.syncedLyrics.trim() ? raw.syncedLyrics : null,
  };
}

function asCandidates(value: unknown): LyricCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.map(asCandidate).filter((entry): entry is LyricCandidate => Boolean(entry));
}

function apiUrl(path: "/get" | "/search", params: Record<string, string>): URL {
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url;
}

/** `null` is lrclib's definitive "not in here"; anything bad throws. */
async function request(url: URL): Promise<unknown | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new LyricsUpstreamError("Couldn't reach the lyrics service.", 502);
  }

  /* lrclib answers 404 with {"name":"TrackNotFound"} — a real answer, not a
   * failure, and the difference decides what gets cached for how long. */
  if (response.status === 404) return null;
  if (response.status === 429) {
    throw new LyricsUpstreamError("The lyrics service is rate limiting us.", 429);
  }
  if (!response.ok) throw new LyricsUpstreamError("Couldn't reach the lyrics service.", 502);
  return response.json().catch(() => null);
}

/**
 * At most three round trips, in order of confidence: the exact record, a
 * name-and-artist search, then one loose phrase — the last of these is what
 * catches tracks lrclib filed under a credit the catalogue does not carry.
 */
async function gather(seed: LyricsSeed): Promise<LyricCandidate[]> {
  const pool: LyricCandidate[] = [];
  let failure: LyricsUpstreamError | null = null;
  const duration = seed.duration ? String(Math.round(seed.duration)) : "";

  const steps: Array<{ path: "/get" | "/search"; params: Record<string, string> }> = [
    {
      path: "/get",
      params: { track_name: seed.title, artist_name: seed.artist, duration },
    },
    { path: "/search", params: { track_name: seed.title, artist_name: seed.artist } },
    {
      path: "/search",
      params: { q: `${seed.title} ${artistCredits(seed.artist)[0] ?? ""}`.trim() },
    },
  ];

  for (const [index, step] of steps.entries()) {
    /* The loose phrase is a tiebreaker, not a routine second question. */
    if (index === 2 && pool.length) break;
    try {
      const payload = await request(apiUrl(step.path, step.params));
      if (!payload) continue;
      if (step.path === "/get") {
        const single = asCandidate(payload);
        if (single) pool.push(single);
      } else {
        pool.push(...asCandidates(payload));
      }
    } catch (error) {
      if (error instanceof LyricsUpstreamError) failure = error;
      else failure = new LyricsUpstreamError("Couldn't reach the lyrics service.", 502);
    }
    if (pool.length >= MAX_CANDIDATES) break;
  }

  if (!pool.length && failure) throw failure;
  return pool;
}

async function resolve(seed: LyricsSeed): Promise<LyricsOutcome> {
  const candidates = await gather(seed);
  const best = pickBest(seed, candidates);
  if (!best) {
    const instrumental = candidates.some((entry) => entry.instrumental);
    return { status: "none", reason: instrumental ? "instrumental" : "none" };
  }

  const result = toResult(seed, best);
  if (!result) {
    return { status: "none", reason: best.instrumental ? "instrumental" : "none" };
  }
  return { status: "found", result };
}

function remember(key: string, entry: Entry): void {
  cache.set(key, entry);
  if (cache.size <= MAX_ENTRIES) return;
  /* Insertion order is the eviction order; the oldest answer goes first. */
  const oldest = cache.keys().next().value;
  if (oldest !== undefined) cache.delete(oldest);
}

function ttlFor(entry: Entry): number {
  if ("failed" in entry) return FAIL_TTL;
  return entry.outcome.status === "found" ? HIT_TTL : MISS_TTL;
}

/**
 * Lyrics for one track. `status: "none"` is the provider's answer and is cached
 * as such; a failure is cached only as a circuit breaker and reported as an
 * error, never as "this song has no lyrics".
 */
export async function lookupLyrics(seed: LyricsSeed): Promise<LyricsOutcome> {
  const key = seedKey(seed);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlFor(hit)) {
    if ("failed" in hit) {
      throw new LyricsUpstreamError("Couldn't reach the lyrics service.", 502);
    }
    return hit.outcome;
  }

  const running = pending.get(key);
  if (running) return running;

  const attempt = resolve(seed).then(
    (outcome) => {
      remember(key, { at: Date.now(), outcome });
      return outcome;
    },
    (error: unknown) => {
      remember(key, { at: Date.now(), failed: true });
      throw error;
    }
  );

  pending.set(key, attempt);
  // The cleanup chain must not become a second, unhandled rejection.
  void attempt.catch(() => undefined).finally(() => pending.delete(key));
  return attempt;
}
