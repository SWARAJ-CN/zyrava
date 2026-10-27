"use client";

import type { Song } from "@/lib/saavn";
import { VIBES, matchesVibe, type Vibe } from "@/components/features/music/filters";
import { REGIONS } from "@/components/features/music/regions";
import type { HeardRecord, NamedScore, TasteState } from "@/lib/history";
import {
  breakdown,
  cosine,
  isSameRecording,
  mmrSelect,
  normalize,
  overlap,
  profileOf,
  rankRelated,
  relatedSeeds,
  similarity,
  tokenize,
  type MmrItem,
  type Profile,
  type RelatedPick,
} from "@/lib/related";

/* ------------------------------------------------------------------ *
 * The taste engine.
 *
 * Everything the listener does — playing, finishing, skipping, liking, saving,
 * searching — is written as a weighted event with a timestamp. The account
 * server keeps those events; this module turns them into a profile and then
 * into shelves of recommendations.
 *
 * The shape mirrors how a large recommender works, with the parts a single
 * listener can supply: a per-item neighbourhood built from what the listener's
 * own seeds retrieve (that is the collaborative signal, one person wide), a
 * mood vector over the app's own vibe taxonomy, exponential time decay, an
 * already-heard guard, a fatigue divisor, an exploration branch and a feedback
 * loop — every shelf press lands back in the same log the shelves read.
 * ------------------------------------------------------------------ */

export type EventKind =
  | "play"
  | "complete"
  | "deep"
  | "skip"
  | "like"
  | "unlike"
  | "playlist_add"
  | "save"
  | "search";

/** One line of the log, in the compact form the buffer stores. */
export interface LoggedEvent {
  /** Idempotency key — the server counts a repeat of this as a duplicate. */
  eid: string;
  k: EventKind;
  sid?: string;
  q?: string;
  at: number;
  pct?: number;
  /** Set once the account server has acknowledged it. */
  u?: 1;
}

/** How much each behaviour says about the listener, in log units. */
export const WEIGHT: Record<EventKind, number> = {
  like: 8,
  playlist_add: 6,
  save: 5,
  complete: 4,
  deep: 2,
  search: 1.5,
  play: 1,
  skip: 0.2,
  unlike: -6,
};

/** A track's influence halves every two weeks. */
export const HALF_LIFE_DAYS = 14;
/** Events inside this window count as "just now" for the radio seed. */
export const RECENCY_DAYS = 3;
/** Anything heard this recently is kept out of the mix and the exploration. */
export const SEEN_BLOCK_DAYS = 7;
/** A track the listener unliked stays out this long. */
export const NEG_BLOCK_DAYS = 30;
/** How long a surfaced id is held back from the shelves. */
const SHOWN_HOURS = 12;

const DAY = 86_400_000;

/** Exponential time decay: 1 for something that just happened. */
export function decay(at: number, halfLife: number = HALF_LIFE_DAYS, now: number = Date.now()): number {
  if (!Number.isFinite(at)) return 0;
  const age = Math.max(0, now - at) / DAY;
  return 0.5 ** (age / halfLife);
}

/**
 * What a finished playback means, judged on how far the listener got.
 * Pausing is deliberately not a signal of its own — it is noise twice per
 * track over.
 */
export function playbackKind(pct: number, seconds: number, ended: boolean): EventKind {
  if (ended || pct >= 0.9) return "complete";
  if (pct >= 0.5 || seconds >= 60) return "deep";
  if (pct <= 0.1 || seconds <= 15) return "skip";
  return "play";
}

export type Stage = "empty" | "priming" | "ready";

/** Enough events before the shelves are worth building at all. */
export function coldStage(events: number): Stage {
  if (events < 8) return "empty";
  if (events < 25) return "priming";
  return "ready";
}

/* ------------------------------------------------------------------ *
 * The local buffer
 * ------------------------------------------------------------------ */

/** Events kept on the device, newest last. */
const MAX_EVENTS = 300;
/** Track snapshots kept so an event id can still be played back. */
const MAX_SONGS = 60;
/** Ids the shelves have already surfaced. */
const MAX_SHOWN = 60;
/** Beyond this the log is dropped, not summarised. */
const MAX_AGE_DAYS = 180;

export interface StoredSong {
  song: Song;
  /** False until the account server has been given this snapshot. */
  uploaded: boolean;
}

export interface LogBuffer {
  v: number;
  events: LoggedEvent[];
  songs: Record<string, StoredSong>;
  shown: Array<{ id: string; at: number }>;
  /** Epoch milliseconds before which a retry is pointless. */
  backoffUntil: number;
}

const emptyBuffer = (): LogBuffer => ({ v: 1, events: [], songs: {}, shown: [], backoffUntil: 0 });

function logKey(userId: string): string {
  return `zyrava:log:${userId}`;
}

export function readLog(userId: string | null | undefined): LogBuffer {
  if (!userId || typeof window === "undefined") return emptyBuffer();
  try {
    const raw = window.localStorage.getItem(logKey(userId));
    if (!raw) return emptyBuffer();
    const parsed = JSON.parse(raw) as Partial<LogBuffer>;
    return {
      v: 1,
      events: Array.isArray(parsed.events) ? parsed.events.slice(-MAX_EVENTS) : [],
      songs: parsed.songs && typeof parsed.songs === "object" ? parsed.songs : {},
      shown: Array.isArray(parsed.shown) ? parsed.shown.slice(-MAX_SHOWN) : [],
      backoffUntil: Number(parsed.backoffUntil) || 0,
    };
  } catch {
    return emptyBuffer();
  }
}

/** Private-mode and quota failures are silent: a full log is never worth a crash. */
export function writeLog(userId: string, buffer: LogBuffer): void {
  if (typeof window === "undefined") return;
  const trimmed = prune(buffer);
  try {
    window.localStorage.setItem(logKey(userId), JSON.stringify(trimmed));
  } catch {
    try {
      window.localStorage.setItem(
        logKey(userId),
        JSON.stringify(prune({ ...trimmed, events: trimmed.events.slice(-100) }))
      );
    } catch {
      /* nowhere left to write — recording stops for this session */
    }
  }
}

function prune(buffer: LogBuffer): LogBuffer {
  const floor = Date.now() - MAX_AGE_DAYS * DAY;
  const events = buffer.events.filter((event) => event.at >= floor).slice(-MAX_EVENTS);

  const used = new Set<string>();
  for (const event of events) if (event.sid) used.add(event.sid);
  for (const entry of buffer.shown) used.add(entry.id);
  const songs: Record<string, StoredSong> = {};
  const ids = Object.keys(buffer.songs)
    .filter((id) => used.has(id) || buffer.songs[id]?.uploaded === false)
    .slice(-MAX_SONGS);
  for (const id of ids) if (buffer.songs[id]) songs[id] = buffer.songs[id];

  return { ...buffer, events, songs, shown: buffer.shown.slice(-MAX_SHOWN) };
}

let eids = 0;
function newEid(): string {
  eids += 1;
  return `${Date.now().toString(36)}-${eids.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Adds one line and its snapshot, keeping the buffer inside its caps. */
export function appendEvent(
  buffer: LogBuffer,
  kind: EventKind,
  song?: Song,
  extra?: { pct?: number; q?: string }
): LogBuffer {
  const event: LoggedEvent = { eid: newEid(), k: kind, at: Date.now() };
  if (song) event.sid = song.id;
  if (extra?.q) event.q = extra.q.slice(0, 80);
  if (extra?.pct !== undefined) event.pct = Math.round(extra.pct * 100) / 100;

  const songs = { ...buffer.songs };
  if (song && !songs[song.id]) songs[song.id] = { song, uploaded: false };

  return prune({ ...buffer, events: [...buffer.events, event], songs });
}

/** Marks the batch the server took (and the batch it refused — a poisoned line must not wedge the queue). */
export function markSent(buffer: LogBuffer, ids: string[]): LogBuffer {
  const sent = new Set(ids);
  const events = buffer.events.map((event) => (sent.has(event.eid) ? { ...event, u: 1 as const } : event));
  const referenced = new Set(
    events.filter((event) => sent.has(event.eid) && event.sid).map((event) => event.sid as string)
  );
  const songs = { ...buffer.songs };
  for (const id of referenced) if (songs[id]) songs[id] = { ...songs[id], uploaded: true };
  return { ...buffer, events, songs };
}

export function pendingEvents(buffer: LogBuffer): LoggedEvent[] {
  return buffer.events.filter((event) => !event.u);
}

export function pendingSongs(buffer: LogBuffer): StoredSong[] {
  return Object.values(buffer.songs).filter((entry) => !entry.uploaded);
}

/** Remembers what the shelves just showed, so a re-roll visibly differs. */
export function rememberShown(buffer: LogBuffer, ids: string[]): LogBuffer {
  const at = Date.now();
  const known = new Set(buffer.shown.map((entry) => entry.id));
  const shown = [...buffer.shown.filter((entry) => at - entry.at < SHOWN_HOURS * 3_600_000)];
  for (const id of ids) {
    if (known.has(id)) continue;
    known.add(id);
    shown.push({ id, at });
  }
  return { ...buffer, shown };
}

/** Ids the shelves surfaced inside the ring window.
 * Exported for the provider, which writes the row it just showed back into the buffer. */
export function shownIds(buffer: LogBuffer, now = Date.now()): Set<string> {
  return new Set(
    buffer.shown.filter((entry) => now - entry.at < SHOWN_HOURS * 3_600_000).map((entry) => entry.id)
  );
}

/* ------------------------------------------------------------------ *
 * The profile
 * ------------------------------------------------------------------ */

export interface TasteSeed extends MmrItem {
  plays: number;
  skips: number;
  last: number;
  /** Weighted, decayed and fatigued — the ranking score for this track. */
  weight: number;
  fresh: number;
}

export interface TasteVector {
  stage: Stage;
  events: number;
  /** Tracks worth seeding from, strongest first. */
  seeds: TasteSeed[];
  /** Artist words across everything the listener likes — the taste signature. */
  artistWords: Set<string>;
  /** Mood centroid of the seeds: the listener as a point in vibe space. */
  centroid: number[];
  /** What this listening session is about: a recency-first second centre of
   *  mass. Recommendations blend with it so a queue of one artist, one road
   *  trip or one workout session reads the room it was built in. */
  session: { centroid: number[]; weight: number; songs: Song[] };
  /** How strongly each artist word is loved, log-scaled — far more signal
   *  than the binary "have I seen this artist" set. */
  artistAffinity: Map<string, number>;
  /** Profiles of what the listener bailed on recently. Candidates that look
   *  like these get pushed down — the negative half of feedback. */
  skipProfiles: Profile[];
  language: string;
  vibe: Vibe | null;
  queries: string[];
  /** ids held back entirely — unliked, or skipped inside the negative window. */
  blocked: Set<string>;
  /** ids heard within the block window; never offered again yet. */
  heard: Set<string>;
  fatigue: Map<string, { plays: number; skips: number }>;
  topArtists: NamedScore[];
  tailArtists: NamedScore[];
  tailLanguages: NamedScore[];
  /** Every language the log mentions, scored. */
  languages: NamedScore[];
  /** Anything with a playable snapshot, for the on-repeat row. */
  playable: Song[];
}

const EMPTY_STATE: TasteState = {
  events: 0,
  since: null,
  songs: [],
  heard: [],
  artists: [],
  languages: [],
  queries: [],
};

/** Fatigue: the third play of a week counts for less than the first. */
function fatigueFor(plays: number): number {
  return 1 / (1 + 0.35 * Math.max(0, plays - 1));
}

/** The listening session this recommendation answers to. */
const SESSION_WINDOW_MS = 90 * 60_000;
/** A track's session influence halves every six hours inside that window. */
const SESSION_HALF_LIFE_HOURS = 6;
/** Recent bail-outs that quietly steer the mix away. */
const SKIP_WINDOW_DAYS = 2;
/** How much of the rendered score the negative contrast can shave. */
const SKIP_SHAVE = 0.3;

/**
 * Folds the account log and the unsent local lines into one profile. The
 * server owns the facts and their aggregate weight; the browser owns the model,
 * which is why no mood vector ever crosses the wire.
 */
export function buildVector(
  state: TasteState | null,
  local: LoggedEvent[],
  /** Snapshots the device is holding for those lines, before the account has them. */
  localSongs: Song[] = [],
  now: number = Date.now()
): TasteVector {
  const merged = state ?? EMPTY_STATE;

  const counts = new Map<string, { plays: number; skips: number; score: number; last: number }>();
  for (const row of merged.heard as HeardRecord[]) {
    counts.set(row.sid, {
      plays: row.plays || 0,
      skips: row.skips || 0,
      score: row.score || 0,
      last: row.last ? Date.parse(row.last) || 0 : 0,
    });
  }
  const snapshots = new Map<string, Song>();
  for (const song of localSongs) snapshots.set(song.id, song);
  for (const song of merged.songs) snapshots.set(song.id, song);

  // Local lines the server has not aggregated yet.
  for (const event of local) {
    if (!event.sid) continue;
    const row = counts.get(event.sid) ?? { plays: 0, skips: 0, score: 0, last: 0 };
    row.score += WEIGHT[event.k] * decay(event.at, HALF_LIFE_DAYS, now);
    row.last = Math.max(row.last, event.at);
    if (event.k === "skip") row.skips += 1;
    else if (event.k !== "search" && event.k !== "unlike") row.plays += 1;
    counts.set(event.sid, row);
  }

  const blocked = new Set<string>();
  const negativeFloor = now - NEG_BLOCK_DAYS * DAY;
  const heardFloor = now - SEEN_BLOCK_DAYS * DAY;
  const heard = new Set<string>();
  for (const [sid, row] of counts) {
    if (row.score < 0 && row.last >= negativeFloor) blocked.add(sid);
    if (row.last >= heardFloor) heard.add(sid);
  }
  for (const event of local) {
    if (event.k === "unlike" && event.sid && event.at >= negativeFloor) blocked.add(event.sid);
  }

  const playable: Song[] = [];
  const candidates: TasteSeed[] = [];
  /** Artist-word love, accumulated log-scale across every positive row. */
  const affinity = new Map<string, number>();
  /** Rows inside the session window — the "right now" second centre. */
  const sessionRows: Array<{ song: Song; w: number; profile: Profile }> = [];
  /** What was bailed on recently — the steering-away set. */
  const skipProfiles: Profile[] = [];
  const skipSeen = new Set<string>();

  for (const [sid, row] of counts) {
    const song = snapshots.get(sid);
    if (!song) continue;
    playable.push(song);
    const profile = profileOf(song);
    if (row.score > 0) {
      const love = Math.log2(1 + Math.max(0, row.score * fatigueFor(row.plays)));
      for (const word of profile.artist) {
        affinity.set(word, (affinity.get(word) ?? 0) + love);
      }
      const ageHours = Math.max(0, (now - row.last) / 3_600_000);
      if (row.last >= now - SESSION_WINDOW_MS) {
        sessionRows.push({ song, w: 0.5 ** (ageHours / SESSION_HALF_LIFE_HOURS), profile });
      }
    }
    // Skips that outweigh plays in the recent window steer the mix away.
    const wroteOff =
      row.skips > 0 &&
      row.skips >= row.plays &&
      row.last >= now - SKIP_WINDOW_DAYS * DAY;
    if (wroteOff && row.score < 8) {
      const key = `${normalize(song.title)}|${normalize(song.artist)}`;
      if (!skipSeen.has(key)) {
        skipSeen.add(key);
        skipProfiles.push(profile);
      }
    }
    const weight = row.score * fatigueFor(row.plays);
    candidates.push({
      song,
      profile,
      raw: weight,
      plays: row.plays,
      skips: row.skips,
      last: row.last,
      weight,
      fresh: decay(row.last, RECENCY_DAYS, now),
    });
  }
  candidates.sort((a, b) => b.weight - a.weight);

  // Affinity to 0..1, so a candidate's artist bonus never swamps the rest.
  let peakAffinity = 0;
  for (const value of affinity.values()) if (value > peakAffinity) peakAffinity = value;
  const artistAffinity = new Map<string, number>();
  if (peakAffinity > 0) {
    for (const [word, value] of affinity) artistAffinity.set(word, value / peakAffinity);
  }

  // The session centre of mass: the strongest recent rows only, so one stray
  // tap does not swing the whole recommendation session.
  sessionRows.sort((a, b) => b.w - a.w);
  const sessionStrong = sessionRows.slice(0, 12);
  const sessionCentroid = new Array(VIBES.length).fill(0);
  let sessionMass = 0;
  for (const row of sessionStrong) {
    sessionMass += row.w;
    for (let index = 0; index < sessionCentroid.length; index += 1) {
      sessionCentroid[index] += (row.profile.mood[index] ?? 0) * row.w;
    }
  }
  const sessionMagnitude = Math.sqrt(
    sessionCentroid.reduce((sum, value) => sum + value * value, 0)
  );
  const sessionVector = sessionMagnitude
    ? sessionCentroid.map((value) => value / sessionMagnitude)
    : sessionCentroid;

  // The negative half of the feedback loop, capped: twelve bail-outs are
  // enough contrast for a whole run of picks.
  const negativeProfiles = skipProfiles.slice(0, 12);

  const seeds = candidates.filter(
    (seed) => seed.weight > 0 && !blocked.has(seed.song.id) && (seed.plays > seed.skips || seed.weight >= 4)
  );

  // Mood centroid — the weighted average of the seeds' vibe vectors.
  const centroid = new Array(VIBES.length).fill(0);
  for (const seed of seeds.slice(0, 24)) {
    const w = Math.max(0, seed.weight) * seed.fresh + 0.05;
    for (let index = 0; index < centroid.length; index += 1) {
      centroid[index] += (seed.profile.mood[index] ?? 0) * w;
    }
  }
  const magnitude = Math.sqrt(centroid.reduce((sum, value) => sum + value * value, 0));
  const mood = magnitude ? centroid.map((value) => value / magnitude) : centroid;

  const artistWords = new Set<string>();
  for (const seed of seeds) for (const word of seed.profile.artist) artistWords.add(word);
  for (const song of merged.songs) for (const word of tokenize(song.artist)) artistWords.add(word);

  const languages = merged.languages.filter((row) => row.name);
  const dominant = languages.slice().sort((a, b) => b.score - a.score)[0];
  const language = dominant?.name ?? seeds[0]?.song.language ?? "";

  const textSeeds = seeds.slice(0, 12).map((seed) => seed.song);
  let vibe: Vibe | null = null;
  let bestVibeHits = 0;
  for (const candidate of VIBES) {
    const hits = textSeeds.filter((song) => matchesVibe(song, candidate)).length;
    if (hits > bestVibeHits) {
      bestVibeHits = hits;
      vibe = candidate;
    }
  }

  const queries = merged.queries
    .slice()
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .map((row) => row.q)
    .filter(Boolean)
    .slice(0, 12);

  const rankedArtists = merged.artists.slice().sort((a, b) => b.score - a.score);
  const fatigue = new Map<string, { plays: number; skips: number }>(
    [...counts].map(([sid, row]) => [sid, { plays: row.plays, skips: row.skips }])
  );

  return {
    stage: coldStage(merged.events + local.length),
    events: merged.events + local.length,
    seeds,
    artistWords,
    centroid: mood,
    session: {
      centroid: sessionVector,
      weight: sessionMass,
      songs: sessionStrong.map((row) => row.song),
    },
    artistAffinity,
    skipProfiles: negativeProfiles,
    language: normalize(language),
    vibe,
    queries,
    blocked,
    heard,
    fatigue,
    languages: languages.slice().sort((a, b) => b.score - a.score),
    topArtists: rankedArtists.slice(0, 5),
    tailArtists: rankedArtists.slice(5, 15),
    tailLanguages: languages.slice(5, 12),
    playable,
  };
}

/* ------------------------------------------------------------------ *
 * Retrieval
 * ------------------------------------------------------------------ */

/** Catalogue lookup, injected so the maths above stays testable. */
export type FetchPool = (phrase: string, limit: number) => Promise<Song[]>;

/** How many round trips one build may make. */
export const MAX_SEARCHES_PER_BUILD = 12;
/** Tracks pulled per phrase; 8 phrases × 18 ≈ a 144-track shortlist. */
const POOL_LIMIT = 18;
/** A candidate earns this per seed phrase that surfaced it, as evidence. */
const EVIDENCE_MAX = 3;

/** Softmax sampling over scores — where variety enters instead of the same five artists. */
function sampleByScore<T>(items: T[], score: (item: T) => number, temperature: number, salt: number): T | null {
  if (!items.length) return null;
  const values = items.map((item) => Math.max(0, score(item)));
  const peak = Math.max(...values);
  if (!Number.isFinite(peak)) return items[0] ?? null;
  const weights = values.map((value) => Math.exp((value - peak) / Math.max(0.05, temperature)));
  const sum = weights.reduce((total, value) => total + value, 0);
  if (sum <= 0) return items[0] ?? null;
  // Deterministic in the salt, so a re-roll changes the draw and nothing else.
  let draw = (Math.sin(salt * 12.9898) * 43758.5453) % 1;
  if (draw < 0) draw += 1;
  let target = draw * sum;
  for (let index = 0; index < items.length; index += 1) {
    target -= weights[index];
    if (target <= 0) return items[index];
  }
  return items[items.length - 1] ?? null;
}

interface PoolEntry {
  song: Song;
  seedRank: number;
}

/* Phrase answers live for ten minutes across builds and re-rolls, so "start
 * over" mostly reuses the catalogue it already fetched. */
const POOL_TTL = 10 * 60_000;
/** How many searches run at once — the server is fine with four. */
const POOL_CONCURRENCY = 3;
const poolCache = new Map<string, { at: number; songs: Song[] }>();

async function fetchCached(phrase: string, fetchPool: FetchPool): Promise<Song[]> {
  const cached = poolCache.get(phrase);
  if (cached && Date.now() - cached.at < POOL_TTL) return cached.songs;
  try {
    const songs = await fetchPool(phrase, POOL_LIMIT);
    poolCache.set(phrase, { at: Date.now(), songs });
    return songs;
  } catch {
    /* a phrase that will not resolve just narrows the pool */
    return [];
  }
}

/** Runs the phrases with a small in-flight overlap and pools what comes back. */
async function gatherPool(
  phrases: string[],
  fetchPool: FetchPool,
  budget: number
): Promise<{ pool: PoolEntry[]; sources: Map<string, Set<number>> }> {
  const pool: PoolEntry[] = [];
  const sources = new Map<string, Set<number>>();
  const seen = new Set<string>();

  const active = phrases.filter((phrase) => phrase && !seen.has(phrase)).slice(0, budget);
  active.forEach((phrase) => seen.add(phrase));

  for (let start = 0; start < active.length; start += POOL_CONCURRENCY) {
    const batch = active.slice(start, start + POOL_CONCURRENCY);
    const batches = await Promise.all(batch.map((phrase) => fetchCached(phrase, fetchPool)));
    batches.forEach((songs, batchIndex) => {
      const phraseIndex = start + batchIndex;
      songs.slice(0, POOL_LIMIT).forEach((song, rank) => {
        pool.push({ song, seedRank: rank });
        const hits = sources.get(song.id) ?? new Set<number>();
        hits.add(phraseIndex);
        sources.set(song.id, hits);
      });
    });
  }
  return { pool, sources };
}

/* ------------------------------------------------------------------ *
 * Shelves
 * ------------------------------------------------------------------ */

export type ShelfKey = "mix" | "radio" | "explore" | "repeat";

export interface Shelf {
  key: ShelfKey;
  /** Generic, vendor-free heading — the tiles themselves carry the "why". */
  title: string;
  picks: RelatedPick[];
  /** The track the row was built around, when there is one. */
  seed?: Song;
}

export interface ShelfOptions {
  limit?: number;
  artistCap?: number;
  /** Re-roll counter, folded into every random draw. */
  salt?: number;
  /** Ids the shelves have already surfaced. */
  shown?: string[];
  /** Track the player is on, used when the log is thin. */
  current?: Song | null;
  budget?: number;
}

const DEFAULTS = { limit: 30, artistCap: 2, salt: 0, budget: MAX_SEARCHES_PER_BUILD };

function guards(v: TasteVector, options: ShelfOptions) {
  const shown = new Set(options.shown ?? []);
  return (song: Song): boolean =>
    shown.has(song.id) || v.blocked.has(song.id) || v.heard.has(song.id);
}

/** Phrases the mix is built from: the strong seeds, one adventurous draw, the scene. */
export function mixPhrases(v: TasteVector, salt: number): string[] {
  const phrases: string[] = [];
  const strong = v.seeds.slice(0, 5);
  for (const seed of strong) {
    const artist = [...seed.profile.artist].slice(0, 2).join(" ");
    if (artist) phrases.push(artist);
  }

  // One pick from ranks 6-20 — this is where the mix stops being a greatest-hits loop.
  const adventurous = sampleByScore(v.seeds.slice(5, 20), (seed) => seed.weight, 0.35, salt);
  if (adventurous) {
    const title = [...adventurous.profile.title].slice(0, 3).join(" ");
    phrases.push(title || normalize(adventurous.song.artist));
  }

  // What this listening session is about right now: the freshest row's album,
  // so a queue built around one record keeps finding songs beside it.
  const sessionTail = v.session.songs[0];
  if (sessionTail) {
    const album = [...profileOf(sessionTail).album].slice(0, 4).join(" ");
    if (album) phrases.push(album);
  }

  const artist = v.topArtists[0]?.name;
  if (artist) phrases.push(normalize(artist));

  if (v.language) phrases.push(`${v.language} ${v.vibe?.queries[0] ?? "songs"}`);
  if (v.queries[0]) phrases.push(v.queries[0]);

  return [...new Set(phrases.map((phrase) => phrase.trim()).filter(Boolean))].slice(0, 8);
}

/**
 * The long row — the app's version of a personal mix. Ranked on how close each
 * candidate sits to the listener's own seeds, how many of those seeds'
 * neighbourhoods surfaced it, how well it matches the mood centroid, then
 * diversified. Familiar anchors are woven in so it never reads as broken.
 */
export async function mixShelf(
  v: TasteVector,
  fetchPool: FetchPool,
  options: ShelfOptions = {}
): Promise<Shelf> {
  const { limit, artistCap, salt, budget } = { ...DEFAULTS, ...options };
  const title = "Your mix";
  if (!v.seeds.length) return { key: "mix", title, picks: [] };

  const phrases = mixPhrases(v, salt);
  const { pool, sources } = await gatherPool(phrases, fetchPool, budget ?? MAX_SEARCHES_PER_BUILD);
  if (!pool.length) return { key: "mix", title, picks: [] };

  const seedProfiles = v.seeds.slice(0, 8).map((seed) => seed.profile);
  const excluded = guards(v, options);
  const anchorIds = new Set(v.seeds.slice(0, 3).map((seed) => seed.song.id));

  const scored: MmrItem[] = [];
  for (const entry of dedupe(pool)) {
    const song = entry.song;
    if (anchorIds.has(song.id)) continue;
    if (excluded(song)) continue;
    const profile = profileOf(song);
    if (seedProfiles.some((seed) => isSameRecording(seed, profile))) continue;

    // Best-seed similarity: the item-item term.
    let best = seedProfiles[0];
    let bestSim = -1;
    for (const seed of seedProfiles) {
      const value = similarity(seed, profile);
      if (value > bestSim) {
        bestSim = value;
        best = seed;
      }
    }
    const parts = breakdown(best, profile);
    const evidence = Math.min(1, (sources.get(song.id)?.size ?? 1) / EVIDENCE_MAX);
    const eraLength = (parts.era + parts.length) / 2;
    const stats = v.fatigue.get(song.id) ?? { plays: 0, skips: 0 };

    // Artist love: one number per artist word, 0..1, from every positive
    // listening event — a much sharper signal than a flat "known artist" bump.
    let artistLove = 0;
    if (profile.artist.size) {
      for (const word of profile.artist) artistLove += v.artistAffinity.get(word) ?? 0;
      artistLove /= profile.artist.size;
    }

    // The long-run centre blended with the session centre: what the listener
    // has been doing this session sways the picks without erasing the base.
    const sessionPull = Math.min(1, v.session.weight / 2);
    const tasteCosine =
      cosine(profile.mood, v.centroid) * (1 - 0.35 * sessionPull) +
      0.35 * sessionPull * cosine(profile.mood, v.session.centroid);

    // Negative contrast: candidates shaped like a recent bail-out slide down.
    let shave = 0;
    for (const writtenOff of v.skipProfiles) {
      const like = similarity(writtenOff, profile);
      if (like > shave) shave = like;
    }

    // Catalogue standing: how far up its own search the recording placed —
    // a light popularity prior that steers toward what actually plays well.
    const standing = 1 - Math.min(1, entry.seedRank / POOL_LIMIT);

    let value =
      0.38 * bestSim +
      0.18 * evidence +
      0.18 * tasteCosine +
      0.1 * artistLove +
      0.07 * standing +
      0.05 * eraLength +
      (normalize(song.language) === v.language ? 0.04 : 0);
    // Learned skips, then per-track skip stats — twice-calibrated negative
    // weights, because what the listener leaves matters as much as what stays.
    value -= SKIP_SHAVE * shave;
    if (stats.skips > stats.plays) value -= 0.05;
    value *= fatigueFor(stats.plays);
    // While the log is thin, similarity is nearly all the signal there is.
    if (v.stage === "priming") value = 0.75 * value + 0.25 * bestSim;

    scored.push({ song, profile, raw: Math.max(0, Math.min(1, value)), echo: parts.title });
  }

  scored.sort((a, b) => b.raw - a.raw);
  const picks = mmrSelect(scored, {
    limit,
    artistCap: v.stage === "priming" ? Math.max(3, artistCap) : artistCap,
    titleClones: 1,
  }).map((item) => ({ song: item.song, score: item.raw, reason: reasonFor(item, seedProfiles) }));

  return { key: "mix", title, seed: v.seeds[0]?.song, picks };
}

function reasonFor(item: MmrItem, seedProfiles: Profile[]): string {
  let best = seedProfiles[0] as Profile;
  let bestSim = -1;
  for (const seed of seedProfiles) {
    const value = similarity(seed, item.profile);
    if (value > bestSim) {
      bestSim = value;
      best = seed;
    }
  }
  const parts = breakdown(best, item.profile);
  const contributions: Array<[string, number]> = [
    ["Same artist", 0.3 * parts.artist],
    ["Similar mood", 0.18 * parts.mood],
    ["Same album", 0.14 * parts.album],
    ["Same language", 0.12 * parts.language],
    ["Similar length", 0.06 * parts.length],
  ];
  const [label, value] = contributions.reduce((top, entry) => (entry[1] > top[1] ? entry : top));
  return value >= 0.05 ? label : "Sounds similar";
}

/** First appearance wins, and it keeps the rank that surfaced the track. */
function dedupe(pool: PoolEntry[]): PoolEntry[] {
  const seen = new Set<string>();
  const out: PoolEntry[] = [];
  for (const entry of pool) {
    if (seen.has(entry.song.id)) continue;
    seen.add(entry.song.id);
    out.push(entry);
  }
  return out;
}

/**
 * One radio built from one seed: the retrieval neighbourhood, then the same
 * ranking the "now playing" panel uses. Both surfaces call this, so they are
 * provably one algorithm.
 */
export async function buildRadioFor(
  seed: Song,
  taste: Set<string>,
  fetchPool: FetchPool,
  limit = 10,
  budget = 4
): Promise<RelatedPick[]> {
  const phrases = relatedSeeds(seed).slice(0, budget);
  const pool: PoolEntry[] = [];
  for (const phrase of phrases) {
    try {
      const songs = await fetchPool(phrase, POOL_LIMIT);
      songs
        .slice(0, POOL_LIMIT)
        // Flat rank across phrases: an artist hit outranks a mood filler.
        .forEach((song, rank) => pool.push({ song, seedRank: phrases.indexOf(phrase) * POOL_LIMIT + rank }));
    } catch {
      /* a phrase that will not resolve just narrows the pool */
    }
  }
  return rankRelated(seed, { pool, limit, artistCap: 2, taste });
}

/** The short row anchored on whatever the listener played most recently. */
export async function radioShelf(
  v: TasteVector,
  fetchPool: FetchPool,
  options: ShelfOptions = {}
): Promise<Shelf> {
  const { limit = 10, shown, current } = { ...DEFAULTS, ...options };
  // What the listener touched most recently dominates the neighbourhood — a
  // radio station that always opens from the road-trip song last clicked.
  const sessionSeed = v.session.songs.find((song) => !v.blocked.has(song.id)) ?? null;
  const recent = v.seeds.slice().sort((a, b) => b.weight * b.fresh - a.weight * a.fresh)[0];
  const seed = sessionSeed ?? recent?.song ?? (current ?? null);
  if (!seed) return { key: "radio", title: "Because you played", picks: [] };

  const picks = (await buildRadioFor(seed, v.artistWords, fetchPool, limit)).filter(
    (pick) => !v.blocked.has(pick.song.id) && !(shown ?? []).includes(pick.song.id)
  );
  return {
    key: "radio",
    title: `Because you played ${seed.title}`,
    seed,
    picks: picks.slice(0, limit),
  };
}

/**
 * The ε-branch: a draw from the tail of what the listener has never quite
 * reached, and only tracks whose artist shares no word with anyone they already
 * know. Short by design — a row that cannot fill four hides itself.
 */
export async function exploreShelf(
  v: TasteVector,
  fetchPool: FetchPool,
  options: ShelfOptions = {}
): Promise<Shelf> {
  const { limit = 8, salt, budget = 4 } = { ...DEFAULTS, ...options };
  const title = "Exploring";
  const excluded = guards(v, options);

  const tails: Array<{ phrase: string; score: number }> = [];
  for (const artist of v.tailArtists) {
    tails.push({ phrase: normalize(artist.name), score: artist.score });
  }
  for (const row of v.tailLanguages.length ? v.tailLanguages : v.languages) {
    const language = normalize(row.name);
    if (!language) continue;
    for (const vibe of VIBES) {
      tails.push({ phrase: `${language} ${vibe.queries[0]}`, score: row.score + (v.vibe === vibe ? 1 : 0) });
    }
  }
  // UCB-style reach: languages the log has never answered get a bonus that
  // grows with everything the listener has already told the engine — the more
  // evidence exists about this listener, the more an unexplored scene is worth.
  const spoken = new Set(v.languages.map((row) => normalize(row.name)));
  const curiosity = Math.sqrt(Math.log2(2 + v.events));
  for (const region of REGIONS) {
    const language = normalize(region.label);
    if (!language || spoken.has(language)) continue;
    for (const vibe of VIBES) {
      tails.push({ phrase: `${language} ${vibe.queries[0]}`, score: curiosity });
    }
  }
  if (!tails.length && v.language) tails.push({ phrase: `${v.language} new releases`, score: 1 });

  const drawn = sampleByScore(tails, (tail) => tail.score, 0.6, salt + 7);
  const phrases: string[] = [];
  if (drawn) phrases.push(drawn.phrase);
  for (const tail of tails.slice().sort((a, b) => b.score - a.score)) {
    if (phrases.length >= Math.min(4, budget)) break;
    if (!phrases.includes(tail.phrase)) phrases.push(tail.phrase);
  }

  let items: MmrItem[] = [];
  let round = 0;
  while (items.length < 4 && round < 2) {
    const fallback = REGIONS[Math.floor(rng(salt + round) * REGIONS.length) % REGIONS.length]?.queries[0];
    const set = round === 0 ? phrases : fallback ? [fallback] : phrases;
    const { pool } = await gatherPool(set as string[], fetchPool, budget);
    const candidates: MmrItem[] = [];
    for (const entry of dedupe(pool)) {
      if (excluded(entry.song)) continue;
      const profile = profileOf(entry.song);
      if (v.seeds.some((seed) => isSameRecording(seed.profile, profile))) continue;
      // Nothing from a name the listener already knows.
      if (overlap(profile.artist, v.artistWords) > 0) continue;
      const best = v.seeds[0]?.profile ?? profile;
      const parts = breakdown(best, profile);
      candidates.push({
        song: entry.song,
        profile,
        raw: 0.35 * parts.mood + 0.25 * cosine(profile.mood, v.centroid) + 0.2 * parts.language +
          0.2 * (1 - Math.min(1, entry.seedRank / POOL_LIMIT)),
        echo: parts.title,
      });
    }
    items = candidates;
    round += 1;
  }

  const picks = items
    .sort((a, b) => b.raw - a.raw)
    .slice(0, limit)
    .map((item) => ({ song: item.song, score: item.raw, reason: "New to you" }));
  return { key: "explore", title, seed: drawn ? undefined : v.seeds[0]?.song, picks };
}

/** A second draw needs a different number, and it must not touch Math.random per candidate. */
function rng(seed: number): number {
  const value = Math.sin(seed * 97.13) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Zero round trips: the tracks with two or more plays, still in order of
 * recency, taken straight from the snapshots the account holds. No fatigue
 * divisor — a listener on repeat is on repeat.
 */
export function repeatShelf(v: TasteVector, limit = 10): Shelf {
  const picks = v.seeds
    .filter((seed) => seed.plays >= 2 && seed.song.streamUrl)
    .sort((a, b) => b.fresh * b.plays - a.fresh * a.plays)
    .slice(0, limit)
    .map((seed) => ({
      song: seed.song,
      score: seed.weight,
      reason: seed.plays >= 5 ? "Played a lot" : "On repeat",
    }));
  return { key: "repeat", title: "On repeat", seed: picks[0]?.song, picks };
}

/** Signature of what a build was based on — changes when the log or the re-roll does. */
export function buildSignature(v: TasteVector, salt: number): string {
  const best = [...v.seeds]
    .sort((a, b) => b.weight * b.fresh - a.weight * a.fresh)[0]
    ?.song?.id ?? "";
  return `${v.events}:${best}:${salt}`;
}

/** How many more events before the shelves are all worth building. */
export function eventsToReady(v: TasteVector): number {
  return Math.max(0, 25 - v.events);
}
