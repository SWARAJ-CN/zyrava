/**
 * Shared shape mapping for Spotify Web API payloads.
 *
 * The routes return lean, stable objects to the UI instead of raw Spotify
 * payloads, so a Spotify API change can't break the client unexpectedly.
 * Pagination follows Spotify's limit/offset model — the UI pages through
 * with the same numbers it sends back.
 */

export type SpotifyArtist = { name: string };

export type SpotifyTrack = {
  id: string;
  name: string;
  artists: string[];
  album: string;
  /** Largest cover URL available, or null for local/missing art. */
  cover: string | null;
  durationMs: number;
  isLocal: boolean;
  /** ISO date the track was liked/added, when Spotify supplies one. */
  addedAt: string | null;
};

export type SpotifyPlaylist = {
  id: string;
  name: string;
  total: number;
  collaborative: boolean;
  /** True when the connected user owns this playlist. */
  ownedByUser: boolean;
  /** Spotify marks private playlists `public: false`. */
  isPublic: boolean;
  ownerName: string;
  cover: string | null;
};

export type Paged<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

const PAGE_LIMIT = 24;
const MAX_LIMIT = 50;

/** Parses limit/offset from query params with Spotify's caps applied. */
export function readPagination(params: URLSearchParams): { limit: number; offset: number } {
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.parseInt(params.get("limit") ?? "", 10) || PAGE_LIMIT)
  );
  const offset = Math.max(0, Number.parseInt(params.get("offset") ?? "", 10) || 0);
  return { limit, offset };
}

type RawArtist = { name?: unknown };
type RawImage = { url?: unknown };
type RawTrack = {
  id?: unknown;
  name?: unknown;
  artists?: RawArtist[];
  album?: { name?: unknown; images?: RawImage[] };
  duration_ms?: unknown;
  is_local?: unknown;
};
export type RawItem = { added_at?: unknown; track?: RawTrack | null; is_local?: unknown };

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function coverOf(images: unknown): string | null {
  const list = Array.isArray(images) ? images : [];
  const url = (list[0] as RawImage | undefined)?.url;
  return typeof url === "string" && url ? url : null;
}

/** Maps a liked-song or playlist-track payload entry; nulls skip cleanly. */
export function mapTrack(item: RawItem): SpotifyTrack | null {
  const track = item.track;
  if (!track || typeof track !== "object") return null;
  const id = text(track.id);
  const name = text(track.name);
  // Local files have no id and can't be read back — surface but don't break.
  if (!id && !name) return null;
  return {
    id: id || `local-${name}`,
    name,
    artists: Array.isArray(track.artists)
      ? track.artists.map((a) => text(a.name)).filter(Boolean)
      : [],
    album: text(track.album?.name),
    cover: coverOf(track.album?.images),
    durationMs: typeof track.duration_ms === "number" ? track.duration_ms : 0,
    isLocal: track.is_local === true || item.is_local === true || !id,
    addedAt: text(item.added_at) || null,
  };
}

export type RawPlaylist = {
  id?: unknown;
  name?: unknown;
  collaborative?: unknown;
  public?: unknown;
  owner?: { display_name?: unknown; id?: unknown };
  tracks?: { total?: unknown };
  images?: unknown;
};

export function mapPlaylist(
  raw: RawPlaylist,
  userId: string | null
): SpotifyPlaylist {
  const ownerId = text(raw.owner?.id);
  return {
    id: text(raw.id),
    name: text(raw.name),
    total: typeof raw.tracks?.total === "number" ? raw.tracks.total : 0,
    collaborative: raw.collaborative === true,
    ownedByUser: Boolean(userId) && ownerId === userId,
    isPublic: raw.public === true,
    ownerName: text(raw.owner?.display_name) || "Unknown owner",
    cover: coverOf(raw.images),
  };
}

/** Uniform error payload for the library routes. */
export function libraryError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
