/**
 * JioSaavn (unofficial) music catalogue.
 *
 * Configured mirrors (the comma-separated URLs in `MUSIC_API`) are tried in
 * order. If every mirror is unavailable, a built-in fallback talks to
 * JioSaavn's own web API directly — the same source the mirrors themselves
 * use — including the DES stream-URL decryption, so the section keeps working
 * even when the whole community-mirror ecosystem is down.
 *
 * Hosted mirrors differ slightly in their payloads (`link` vs `url` keys,
 * artist fields as strings or objects…) and the direct API uses its own
 * shape; everything is normalised here so the UI only ever sees one shape.
 */

import forge from "node-forge";

const rawBase = (process.env.MUSIC_API ?? "").trim().replace(/\/+$/, "");

/**
 * One base URL per entry; multiple can be supplied comma-separated. Community
 * mirrors of this API go offline often (quota, deploys), so the catalogue is
 * tried against each in order and the first live one wins.
 */
const API_BASES = rawBase
  ? rawBase.split(",").map((base) => base.trim().replace(/\/+$/, "")).filter(Boolean)
  : [];

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
  return Array.isArray(value) ? (value as QualityTier[]) : [];
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

  const images = asTierList(raw.image ?? raw.song_image);
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
    image: pickTier(images, ["500x500", "150x150", "50x50"]) || clean(raw.song_image),
    imageLarge: pickTier(images, ["500x500", "150x150"]) || clean(raw.song_image),
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

  const images = asTierList(raw.image);
  return {
    id,
    title,
    image: pickTier(images, ["500x500", "150x150", "50x50"]) || "",
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

  // Small covers ship at 150x150; the 500x500 copy sits on the same CDN path.
  const image = clean(raw.image);
  const imageLarge = image.replace(/150x150/, "500x500");

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
        image: artwork(clean(raw.image)),
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
    image: artwork(clean(payload.image)),
    songCount: Number.parseInt(String(payload.list_count ?? ""), 10) || songs.length,
    language: clean(payload.language),
    pageUrl: clean(payload.perma_url),
    songs,
  };
}


function isRetryable(status: number): boolean {
  return status === 429 || status === 404 || status >= 500;
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
    signal: AbortSignal.timeout(20_000),
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
  return `${title}|${artist}`;
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

/**
 * Searches the catalogue. `page` starts at 1.
 *
 * Walks the configured bases and returns the first success; a definitive
 * answer (e.g. an empty result for a valid query) from an earlier base is
 * preferred over later bases. Only network failures, 429s and 5xx move on to
 * the next mirror.
 */
export async function searchSongs(
  query: string,
  limit = 20,
  page = 1
): Promise<SearchSuccess> {
  // No bases configured is fine — the built-in direct fallback below takes
  // over and the section still works out of the box.
  let lastError: MusicApiError | null = null;

  for (const base of API_BASES) {
    try {
      const result = await searchSongsOn(base, query, limit, page);
      return { ...result, songs: dedupeSongs(result.songs) };
    } catch (error) {
      if (error instanceof MusicApiError && isRetryable(error.status)) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  // No configured mirror answered — try JioSaavn directly before giving up.
  try {
    const result = await searchSongsDirect(query, limit, page);
    return { ...result, songs: dedupeSongs(result.songs) };
  } catch (directError) {
    if (lastError?.status === 429) {
      throw new MusicApiError(
        "All music sources are rate limited right now — try again in a little while.",
        429
      );
    }
    throw lastError ?? directError;
  }
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
    signal: AbortSignal.timeout(20_000),
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
