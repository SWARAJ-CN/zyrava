/**
 * One playlist — metadata plus its tracks, paginated.
 *
 * Where the Web API supports reading a playlist's tracks this returns them;
 * a 404 (non-existent or not shared with this user) is reported cleanly so
 * the UI can show a notice instead of pretending the list is empty.
 */
import { NextResponse, type NextRequest } from "next/server";
import { spotifyApiFetch } from "@/lib/spotify/session";
import {
  libraryError,
  mapPlaylist,
  mapTrack,
  readPagination,
  type Paged,
  type RawItem,
  type RawPlaylist,
  type SpotifyPlaylist,
  type SpotifyTrack,
} from "@/lib/spotify/library";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!id) return libraryError(400, "missing_playlist_id");
  const { limit, offset } = readPagination(request.nextUrl.searchParams);

  const meta = await spotifyApiFetch(`/playlists/${encodeURIComponent(id)}`);
  if (meta.status === 404) return libraryError(404, "playlist_not_found");
  if (meta.status === 401) return libraryError(401, "unauthorized");
  if (meta.status === 429) return libraryError(429, "rate_limited");
  if (!meta.ok) return libraryError(502, "spotify_error");

  const rawMeta = (await meta.json().catch(() => null)) as
    | (Record<string, unknown> & { tracks?: { total?: number } })
    | null;
  if (!rawMeta) return libraryError(502, "spotify_error");

  const tracksResponse = await spotifyApiFetch(`/playlists/${encodeURIComponent(id)}/tracks`, {
    limit,
    offset,
  });
  if (tracksResponse.status === 401) return libraryError(401, "unauthorized");
  if (tracksResponse.status === 404) {
    // Playlist exists but its tracks aren't readable — report, don't fake.
    return libraryError(404, "tracks_unavailable");
  }
  if (!tracksResponse.ok) return libraryError(502, "spotify_error");

  const rawTracks = (await tracksResponse.json().catch(() => null)) as {
    total?: number;
    items?: Array<Record<string, unknown>> | null;
  } | null;
  if (!rawTracks) return libraryError(502, "spotify_error");

  const items = (rawTracks.items ?? [])
    .map(mapTrack)
    .filter((track): track is SpotifyTrack => track !== null);

  return NextResponse.json({
    playlist: mapPlaylist(rawMeta, null),
    tracks: {
      items,
      total: typeof rawTracks.total === "number" ? rawTracks.total : items.length,
      limit,
      offset,
    } satisfies Paged<SpotifyTrack>,
  });
}

export type PlaylistTracksResponse = {
  playlist: SpotifyPlaylist;
  tracks: Paged<SpotifyTrack>;
};
