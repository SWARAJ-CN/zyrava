/**
 * Liked Songs — `GET /me/tracks`, paginated. Newest liked first (Spotify's
 * default ordering). Entries whose track object is missing (removed/local)
 * are skipped rather than breaking the page.
 */
import { NextResponse, type NextRequest } from "next/server";
import { spotifyApiFetch } from "@/lib/spotify/session";
import {
  libraryError,
  mapTrack,
  readPagination,
  type Paged,
  type RawItem,
  type SpotifyTrack,
} from "@/lib/spotify/library";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { limit, offset } = readPagination(request.nextUrl.searchParams);
  const response = await spotifyApiFetch("/me/tracks", { limit, offset });
  if (response.status === 401) return libraryError(401, "unauthorized");
  if (response.status === 429) {
    return libraryError(429, "rate_limited");
  }
  if (!response.ok) return libraryError(502, "spotify_error");

  const raw = (await response.json().catch(() => null)) as {
    total?: number;
    items?: RawItem[] | null;
  } | null;
  if (!raw) return libraryError(502, "spotify_error");

  const items = (raw.items ?? [])
    .map(mapTrack)
    .filter((track): track is SpotifyTrack => track !== null);

  return NextResponse.json({
    items,
    total: typeof raw.total === "number" ? raw.total : items.length,
    limit,
    offset,
  } satisfies Paged<SpotifyTrack>);
}
