/**
 * JioSaavn (unofficial) music catalogue.
 *
 * Configured mirrors come from `MUSIC_API`. Song search checks match quality
 * before accepting a response and can consult JioSaavn directly when a mirror
 * returns only alternate recordings. Playlist requests retain their ordered
 * network fallback. Direct responses include DES stream-URL decryption.
 *
 * Hosted mirrors differ slightly in their payloads (`link` vs `url` keys,
 * artist fields as strings or objects…) and the direct API uses its own
 * shape; everything is normalised here so the UI only ever sees one shape.
 */

import forge from "node-forge";
import { normalizeSearch, rankSearchResults, recordingVersion, searchIntent, searchRelevance } from "./search-relevance";

const rawBase = (process.env.MUSIC_API ?? "").trim().replace(/\/+$/, "");

/**
 * One base URL per entry; multiple can be supplied comma-separated. Community
 * mirrors can differ in availability and catalogue coverage. Song searches
 * probe at most two configured mirrors plus the direct catalogue.
 */
const API_BASES = rawBase
  ? rawBase.split(",").map((base) => base.trim().replace(/\/+$/, "")).filter(Boolean)
  : [];

/** Where a track's audio lives when it is already on this device. */
export type OfflineSource = "download" | "local";

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  year: string;
  language: string;
  /** Duration in seconds. */
  duration: number;
  /** Small artwork for grid tiles / the player bar. */
  image: string;
  /** Larger artwork kept for the (future) full-screen view. */
  imageLarge: string;
  /** Direct playable stream URL from the CDN. */
  streamUrl: string;
  /** Canonical JioSaavn page, used for the "open externally" affordance. */
  pageUrl: string;
  /**
   * Set for device-local audio, which has no stream to point at. The player
   * resolves this to an object URL instead of reading `streamUrl`.
   */
  offline?: { kind: OfflineSource; id: string };
}

export class MusicApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&(?:apos|#0*39|#x0*27);/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(value: unknown): string {
  return typeof value === "string" ? decodeEntities(value) : "";
}

/** A quality entry is `{ quality, link }` (older forks) or `{ quality, url }` (newer). */
type QualityTier =
  | { quality?: unknown; link?: unknown; url?: unknown }
  | string
  | null
  | undefined;

function tierUrl(entry: QualityTier): string {
  if (!entry) return "";
  if (typeof entry === "string") return entry.trim();
  const raw = entry.link ?? entry.url;
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Picks the preferred tier from a quality list, falling back to the last
 * usable entry (lists are ordered worst → best on the upstream API).
 */
function pickTier(tiers: QualityTier[], preferred: string[]): string {
  for (const quality of preferred) {
    for (const entry of tiers) {
      const candidate = tierUrl(entry);
      if (candidate && !candidate.startsWith("http")) continue;
      const entryQuality = typeof entry === "object" ? clean(entry?.quality) : "";
      if (candidate && entryQuality === quality) return candidate;
    }
  }
  for (let index = tiers.length - 1; index >= 0; index -= 1) {
    const candidate = tierUrl(tiers[index]);
    if (candidate.startsWith("http")) return candidate;
  }
  return "";
}

function asTierList(value: unknown): QualityTier[] {
  if (Array.isArray(value)) return value as QualityTier[];
  // Some payloads send one `{ quality, url }` object instead of an array, and
  // the direct API sends a plain URL string. Normalising all three shapes here
  // means every caller (songs, playlists, artwork) reads the same field.
  if (value && typeof value === "object") return [value as QualityTier];
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

/** The best usable artwork URL from a string, object or quality array. */
function imageUrl(value: unknown, preferred = ["500x500", "150x150", "50x50"]): string {
  return pickTier(asTierList(value), preferred) || clean(value);
}

/** Artist fields arrive as a plain string, an array of objects, or nested. */
function artistNames(value: unknown): string {
  if (typeof value === "string") return decodeEntities(value);
  const names: string[] = [];
  const collect = (entry: unknown) => {
    if (typeof entry === "string") {
      const name = decodeEntities(entry);
      if (name && !names.includes(name)) names.push(name);
    } else if (entry && typeof entry === "object") {
      const name = decodeEntities((entry as { name?: unknown }).name as string);
      if (name && !names.includes(name)) names.push(name);
    }
  };
  if (Array.isArray(value)) value.forEach(collect);
  else if (value && typeof value === "object") {
    const record = value as { primary?: unknown; all?: unknown; name?: unknown };
    if (record.primary || record.all) {
      (Array.isArray(record.primary) ? record.primary : record.all as unknown[])
        ?.forEach(collect);
    } else collect(record.name);
  }
  return names.slice(0, 3).join(", ");
}

function toSong(raw: Record<string, unknown>): Song | null {
  const id = clean(raw.id) || clean(raw.song_id);
  if (!id) return null;

  const media = asTierList(raw.downloadUrl ?? raw.download_links)
    .map((tier) => {
      // The flat v1 API uses bare strings in download_links.
      if (typeof tier === "string") return { link: tier };
      return tier;
    });
  const streamUrl = pickTier(media, ["320kbps", "160kbps", "96kbps", "48kbps", "12kbps"]);
  if (!streamUrl) return null;

  const durationRaw = raw.duration ?? raw.song_duration;
  const duration =
    typeof durationRaw === "number"
      ? durationRaw
      : Number.parseInt(String(durationRaw ?? "0"), 10) || 0;

  const albumRaw =
    (raw.album && typeof raw.album === "object"
      ? clean((raw.album as { name?: unknown }).name)
      : clean(raw.album)) || clean(raw.album_name);

  const artist =
    artistNames(raw.primaryArtists) ||
    artistNames((raw.artists as { primary?: unknown } | undefined)?.primary) ||
    artistNames(raw.artists) ||
    artistNames(raw.singers) ||
    clean(raw.song_artist);

  return {
    id,
    title: clean(raw.name) || clean(raw.song_name) || "Untitled",
    artist: artist || "Various artists",
    album: albumRaw,
    year: clean(raw.year) || "",
    language: clean(raw.language) || clean(raw.song_language),
    duration,
    image: imageUrl(raw.image ?? raw.song_image) || clean(raw.song_image),
    imageLarge:
      imageUrl(raw.image ?? raw.song_image, ["500x500", "150x150"]) ||
      clean(raw.song_image),
    streamUrl,
    pageUrl: clean(raw.url) || clean(raw.link) || clean(raw.song_link),
  };
}

export interface SearchSuccess {
  songs: Song[];
  total: number;
}

/* ------------------------------------------------------------------ *
 * Playlists — catalogue search and one playlist's tracks.             *
 * ------------------------------------------------------------------ */
export interface PlaylistSummary {
  id: string;
  title: string;
  image: string;
  songCount: number;
  language: string;
  pageUrl: string;
}

export interface PlaylistSearch {
  playlists: PlaylistSummary[];
  total: number;
}

export interface PlaylistDetail extends PlaylistSummary {
  songs: Song[];
}

function toPlaylistSummary(raw: Record<string, unknown>): PlaylistSummary | null {
  const id = clean(raw.id);
  const title = clean(raw.name) || clean(raw.title);
  if (!id || !title) return null;

  return {
    id,
    title,
    image: imageUrl(raw.image),
    songCount: Number(raw.songCount ?? raw.song_count ?? 0) || 0,
    language: clean(raw.language),
    pageUrl: clean(raw.url),
  };
}

async function playlistFetch<T extends { success?: boolean }>(path: string): Promise<T | null> {
  for (const base of API_BASES) {
    try {
      const response = await fetch(`${base}${path}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) continue;
      const payload = (await response.json().catch(() => null)) as T | null;
      if (!payload || payload.success === false) continue;
      return payload;
    } catch {
      /* try the next mirror */
    }
  }
  return null;
}

export async function searchPlaylists(
  query: string,
  limit = 8
): Promise<PlaylistSearch | null> {
  const payload = await playlistFetch<{
    success?: boolean;
    data?: { results?: Record<string, unknown>[]; total?: unknown };
  }>(`/search/playlists?query=${encodeURIComponent(query)}&limit=${limit}`);

  if (payload?.data) {
    const playlists = (payload.data.results ?? [])
      .map(toPlaylistSummary)
      .filter((playlist): playlist is PlaylistSummary => playlist !== null);
    const total =
      typeof payload.data.total === "number" ? payload.data.total : playlists.length;

    return { playlists, total };
  }

  // No mirror answered — ask JioSaavn the way the mirrors themselves do.
  return searchPlaylistsDirect(query, limit);
}

export async function getPlaylistDetail(id: string): Promise<PlaylistDetail | null> {
  const payload = await playlistFetch<{
    success?: boolean;
    data?: Record<string, unknown>;
  }>(`/playlists?id=${encodeURIComponent(id)}`);

  const data = payload?.data;
  if (data) {
    const summary = toPlaylistSummary(data);
    if (summary) {
      const rawSongs = Array.isArray(data.songs) ? (data.songs as Record<string, unknown>[]) : [];
      const songs = dedupeSongs(
        rawSongs.map(toSong).filter((song): song is Song => song !== null)
      );
      return { ...summary, songCount: summary.songCount || songs.length, songs };
    }
  }

  return getPlaylistDetailDirect(id);
}

/** One `api.php` call, or null when the web API does not answer. */async function directApi<T>(params: Record<string, string>): Promise<T | null> {
  const url = new URL("https://www.jiosaavn.com/api.php");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("_format", "json");
  url.searchParams.set("_marker", "0");
  url.searchParams.set("api_version", "4");
  url.searchParams.set("ctx", "web6dot0");

  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": JIOSAAVN_USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);

  if (!response?.ok) return null;
  return (await response.json().catch(() => null)) as T | null;
}

/** A song entry as JioSaavn's own API returns it (search results, playlist lists). */
function toDirectSong(raw: Record<string, unknown>): Song | null {
  // `more_info` holds the playable bits; bail quietly if it is missing.
  const more = (raw.more_info ?? {}) as Record<string, unknown>;
  const encrypted = decryptMediaUrl(more.encrypted_media_url);
  if (!encrypted) return null;

  const wants320 = more["320kbps"] === "true";
  const streamUrl = encrypted.replace(
    /_96(?:\.premium)?\.mp4$/,
    wants320 ? "_320.mp4" : "_160.mp4"
  );
  if (!/^https?:\/\//.test(streamUrl)) return null;

  // The web API sends one 150x150 URL; mirrors send a quality array. Keep the
  // 500x500 copy when the payload offers it, otherwise derive it from the CDN
  // path as before.
  const artworkSource = raw.image ?? raw.song_image;
  const image = imageUrl(artworkSource);
  // A quality array can hand us the 500x500 entry directly; a plain string only
  // carries the 150x150 URL, so derive the larger copy from its CDN path.
  const fromTiers =
    Array.isArray(artworkSource) || (artworkSource && typeof artworkSource === "object")
      ? imageUrl(artworkSource, ["500x500"])
      : "";
  const imageLarge = fromTiers || image.replace(/150x150/, "500x500");

  const artist =
    artistNames((more.artistMap as { primary_artists?: unknown } | undefined)?.primary_artists) ||
    clean(more.music) ||
    clean(raw.subtitle);

  const duration =
    typeof more.duration === "number"
      ? more.duration
      : Number.parseInt(String(more.duration ?? "0"), 10) || 0;

  const song: Song = {
    id: clean(raw.id),
    title: clean(raw.title) || "Untitled",
    artist: artist || "Various artists",
    album: clean(more.album),
    year: clean(raw.year),
    language: clean(raw.language),
    duration,
    image,
    imageLarge,
    streamUrl,
    pageUrl: clean(raw.perma_url),
  };
  return song.id ? song : null;
}

/** Editorial artwork is occasionally an error page instead of a URL. */
function artwork(value: string): string {
  return /^https:\/\/\S+\.(?:jpg|jpeg|png|webp)(?:\?\S*)?$/i.test(value) ? value : "";
}

/** `search.getPlaylistResults` — playlist search straight from JioSaavn. */
async function searchPlaylistsDirect(query: string, limit: number): Promise<PlaylistSearch | null> {
  const payload = await directApi<{ total?: unknown; results?: Record<string, unknown>[] }>({
    __call: "search.getPlaylistResults",
    q: query,
    n: String(Math.max(limit, 10)),
    p: "1",
  });
  if (!payload || !Array.isArray(payload.results)) return null;

  const playlists = payload.results
    .map((raw): PlaylistSummary | null => {
      const id = clean(raw.id);
      // Some titles arrive double-escaped (&amp;amp;), so decode twice.
      const title = decodeEntities(clean(raw.title));
      if (!id || !title) return null;
      const more = (raw.more_info ?? {}) as Record<string, unknown>;
      // `song_count` lives in more_info; the subtitle reads "23 Songs".
      const count =
        Number.parseInt(String(more.song_count ?? ""), 10) ||
        Number.parseInt(clean(raw.subtitle), 10) ||
        0;
      return {
        id,
        title,
        image: artwork(imageUrl(raw.image)),
        songCount: count,
        language: clean(more.language),
        pageUrl: clean(raw.perma_url),
      };
    })
    .filter((playlist): playlist is PlaylistSummary => playlist !== null)
    .slice(0, limit);

  const total =
    typeof payload.total === "number"
      ? payload.total
      : Number.parseInt(String(payload.total ?? playlists.length), 10) || playlists.length;

  return { playlists, total };
}

/** `playlist.getDetails` — the tracks of one playlist, decrypted like a search hit. */
async function getPlaylistDetailDirect(id: string): Promise<PlaylistDetail | null> {
  const payload = await directApi<{
    title?: unknown;
    image?: unknown;
    language?: unknown;
    perma_url?: unknown;
    list_count?: unknown;
    list?: Record<string, unknown>[];
  }>({
    __call: "playlist.getDetails",
    listid: id,
  });

  const rawSongs = Array.isArray(payload?.list) ? payload.list : [];
  if (!payload || (!clean(payload.title) && !rawSongs.length)) return null;

  const songs = dedupeSongs(
    rawSongs.map(toDirectSong).filter((song): song is Song => song !== null)
  );

  return {
    id,
    title: decodeEntities(clean(payload.title)) || "Playlist",
    // Details already come back at full size, so no CDN rewrite here either.
    image: artwork(imageUrl(payload.image)),
    songCount: Number.parseInt(String(payload.list_count ?? ""), 10) || songs.length,
    language: clean(payload.language),
    pageUrl: clean(payload.perma_url),
    songs,
  };
}



/** DES key the JioSaavn web frontend encrypts media URLs with. */
const JIOSAAVN_KEY = "38346591";

/** JioSaavn's own web API rejects requests that do not look like a browser. */
const JIOSAAVN_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

function decryptMediaUrl(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  try {
    // Pure-JS crypto (node-forge): DES lives inside OpenSSL's legacy provider,
    // which Node's crypto module cannot reach in most confined hosts.
    const decipher = forge.cipher.createDecipher(
      "DES-ECB",
      forge.util.createBuffer(JIOSAAVN_KEY)
    );
    decipher.start({ iv: forge.util.createBuffer("00000000") });
    decipher.update(forge.util.createBuffer(forge.util.decode64(value)));
    decipher.finish();
    return decipher.output.getBytes();
  } catch {
    return "";
  }
}

/**
 * The built-in fallback: JioSaavn's own web API, reachable when no mirror is.
 * Response shape: `{ total, results: [{ id, title, perma_url, image, …,
 * more_info: { album, duration, encrypted_media_url, artistMap, … } }] }`.
 */
async function searchSongsDirect(
  query: string,
  limit: number,
  page: number
): Promise<SearchSuccess> {
  const searchUrl = new URL("https://www.jiosaavn.com/api.php");
  searchUrl.searchParams.set("__call", "search.getResults");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("_format", "json");
  searchUrl.searchParams.set("_marker", "0");
  searchUrl.searchParams.set("api_version", "4");
  searchUrl.searchParams.set("ctx", "web6dot0");
  searchUrl.searchParams.set("n", String(limit));
  searchUrl.searchParams.set("p", String(page));

  const response = await fetch(searchUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": JIOSAAVN_USER_AGENT,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {
    throw new MusicApiError("Could not reach the music service.", 503);
  });

  if (response.status === 429) {
    throw new MusicApiError("The music service is rate limiting this host for now.", 429);
  }

  const payload = (await response.json().catch(() => null)) as
    | { results?: Record<string, unknown>[]; total?: unknown }
    | null;

  if (!response.ok || !payload) {
    throw new MusicApiError(
      "The music service search returned an error.",
      response.status
    );
  }

  const songs = ((payload.results ?? []) as Record<string, unknown>[]).map(toDirectSong);

  const usable = songs.filter((song): song is Song => song !== null);
  const total =
    typeof payload.total === "number"
      ? payload.total
      : Number.parseInt(String(payload.total ?? usable.length), 10) || usable.length;

  return { songs: usable, total };
}

/**
 * Stable identity for one recording across the catalogue's re-listings. The
 * same track often comes back under several ids, album spellings and
 * "(From …)" suffixes; base title + artist ignores those without merging a
 * remix (which carries a different runtime).
 */
function songIdentity(song: Song): string {
  const title = song.title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s*[([].*?[)\]]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const artist = song.artist.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  return `${title}|${artist}|${recordingVersion(song)}`;
}

/** Exact identity, including the runtime — used for quick lookups. */
export function songFingerprint(song: Song): string {
  return `${songIdentity(song)}|${Math.round(song.duration || 0)}`;
}

/** Keeps the first copy of every recording. Runtimes within a few seconds are
 *  treated as the same master (different album encodes vary by a second). */
export function dedupeSongs(songs: Song[]): Song[] {
  const kept = new Map<string, number[]>();
  return songs.filter((song) => {
    const identity = songIdentity(song);
    const duration = Math.round(song.duration || 0);
    const lengths = kept.get(identity) ?? [];
    if (lengths.some((value) => Math.abs(value - duration) <= 3)) return false;
    lengths.push(duration);
    kept.set(identity, lengths);
    return true;
  });
}

const SEARCH_WINDOW = 30;
const SEARCH_CACHE_MS = 120_000;
type SearchSource = string | null;
type SearchPlan = { source: SearchSource; query: string; first: SearchSuccess };
// Coalesce suggestion/list requests. Keep the chosen source/query stable across
// page sizes and pagination; never cache failures as successful empty searches.
const searchPlans = new Map<string, { expires: number; promise: Promise<SearchPlan> }>();

function fetchSearch(source: SearchSource, query: string, page: number) {
  return source === null
    ? searchSongsDirect(query, SEARCH_WINDOW, page)
    : searchSongsOn(source, query, SEARCH_WINDOW, page);
}

async function chooseSearchPlan(query: string, quality: boolean): Promise<SearchPlan> {
  const sources: SearchSource[] = [...new Set(API_BASES.slice(0, 2)), null];
  const intent = searchIntent(query);
  const catalogueQuery = quality ? intent.catalogueQuery : query;
  let primary: SearchPlan | undefined;
  let firstError: unknown;
  try {
    primary = { source: sources[0], query: catalogueQuery, first: await fetchSearch(sources[0], catalogueQuery, 1) };
    if (!quality || primary.first.songs.some((song) => searchRelevance(song, query).confident)) return primary;
  } catch (error) { firstError = error; }

  // A 200 response containing covers is not a satisfactory exact-song match.
  // Try another source and, for "title by artist", title-only retrieval so an
  // artist typo does not exclude the original before our ranker can inspect it.
  const probes = sources.slice(1).map((source) => ({ source, query: catalogueQuery }));
  if (quality && intent.artist) {
    for (const source of sources) probes.push({ source, query: intent.titleQuery });
  }
  const outcomes = await Promise.allSettled(probes.map(async (probe) => ({
    ...probe, first: await fetchSearch(probe.source, probe.query, 1),
  })));
  const plans = primary ? [primary] : [];
  for (const outcome of outcomes) {
    if (outcome.status === "fulfilled") plans.push(outcome.value);
    else firstError ??= outcome.reason;
  }
  if (!plans.length) throw firstError ?? new MusicApiError("Could not reach the music service.", 503);
  const bestScore = (plan: SearchPlan) => Math.max(-Infinity,
    ...plan.first.songs.map((song) => searchRelevance(song, query).score));
  plans.sort((a, b) => bestScore(b) - bestScore(a));
  return plans[0];
}

function getSearchPlan(query: string, quality: boolean): Promise<SearchPlan> {
  const key = `${quality}|${normalizeSearch(query)}`;
  const existing = searchPlans.get(key);
  if (existing && existing.expires > Date.now()) return existing.promise;
  const promise = chooseSearchPlan(query, quality);
  searchPlans.delete(key);
  searchPlans.set(key, { expires: Date.now() + SEARCH_CACHE_MS, promise });
  while (searchPlans.size > 128) searchPlans.delete(searchPlans.keys().next().value!);
  void promise.catch(() => {
    if (searchPlans.get(key)?.promise === promise) searchPlans.delete(key);
  });
  return promise;
}

/** Stable 30-result windows: a 6-song suggestion tray and 10-song pages share
 * the same ranked prefix. Slice by absolute offset, never discard overfetch. */
export async function searchSongs(
  query: string,
  limit = 20,
  page = 1,
  options: { quality?: boolean } = {}
): Promise<SearchSuccess> {
  const quality = options.quality !== false;
  const plan = await getSearchPlan(query, quality);
  const start = (page - 1) * limit;
  const firstWindow = Math.floor(start / SEARCH_WINDOW) + 1;
  const lastWindow = Math.floor((start + limit - 1) / SEARCH_WINDOW) + 1;
  const windows = await Promise.all(Array.from({ length: lastWindow - firstWindow + 1 }, (_, index) => {
    const window = firstWindow + index;
    return window === 1 ? plan.first : fetchSearch(plan.source, plan.query, window);
  }));
  const ranked = windows.flatMap((result) => quality ? rankSearchResults(result.songs, query) : result.songs);
  const offset = start % SEARCH_WINDOW;
  return { songs: dedupeSongs(ranked.slice(offset, offset + limit)), total: plan.first.total };
}

async function searchSongsOn(
  base: string,
  query: string,
  limit: number,
  page: number
): Promise<SearchSuccess> {
  const searchUrl = new URL(`${base}/search/songs`);
  searchUrl.searchParams.set("query", query);
  searchUrl.searchParams.set("limit", String(limit));
  searchUrl.searchParams.set("page", String(page));

  const response = await fetch(searchUrl, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {
    throw new MusicApiError(
      "Could not reach the music service. Try again shortly.",
      503
    );
  });

  if (response.status === 429) {
    throw new MusicApiError("This music mirror has hit its request limit.", 429);
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        status?: string;
        success?: boolean;
        message?: string;
        data?: { results?: unknown[]; total?: unknown } | unknown[];
        results?: unknown[];
      }
    | null;

  if (!response.ok || !payload) {
    throw new MusicApiError(
      clean(payload?.message as string) || "The music service returned an error.",
      response.status
    );
  }

  const failed = payload.status?.toUpperCase?.() === "FAILED" || payload.success === false;
  if (failed) {
    throw new MusicApiError(clean(payload.message) || "The search failed upstream.", 502);
  }

  if (Array.isArray(payload.data)) {
    // Some forks put the result array straight into `data`.
    const songs = (payload.data as Record<string, unknown>[]).map(toSong);
    return { songs: songs.filter((song): song is Song => song !== null), total: songs.length };
  }

  const results = (payload.data?.results ?? payload.results ?? []) as Record<string, unknown>[];
  const songs = results.map(toSong).filter((song): song is Song => song !== null);
  const totalRaw = (payload.data as { total?: unknown } | undefined)?.total;
  const total =
    typeof totalRaw === "number"
      ? totalRaw
      : Number.parseInt(String(totalRaw ?? songs.length), 10) || songs.length;

  return { songs, total };
}
