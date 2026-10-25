/**
 * The user's playlists — includes private and collaborative ones, thanks to
 * the `playlist-read-private` and `playlist-read-collaborative` scopes.
 * Each entry carries ownership/collab flags so the UI can badge them.
 */
import { NextResponse, type NextRequest } from "next/server";
import { spotifyApiFetch } from "@/lib/spotify/session";
import {
  libraryError,
  mapPlaylist,
  readPagination,
  type Paged,
  type RawPlaylist,
  type SpotifyPlaylist,
} from "@/lib/spotify/library";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { limit, offset } = readPagination(request.nextUrl.searchParams);
  const response = await spotifyApiFetch("/me/playlists", { limit, offset });
  if (response.status === 401) return libraryError(401, "unauthorized");
  if (response.status === 429) return libraryError(429, "rate_limited");
  if (!response.ok) return libraryError(502, "spotify_error");

  const raw = (await response.json().catch(() => null)) as {
    total?: number;
    items?: RawPlaylist[] | null;
  } | null;
  if (!raw) return libraryError(502, "spotify_error");

  // Ownership flags need the connected user's id — one extra profile call.
  const profile = await spotifyApiFetch("/me");
  const userId = profile.ok
    ? ((await profile.json().catch(() => null)) as { id?: string } | null)?.id ?? null
    : null;

  const items = (raw.items ?? [])
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => mapPlaylist(entry, userId));

  return NextResponse.json({
    items,
    total: typeof raw.total === "number" ? raw.total : items.length,
    limit,
    offset,
  } satisfies Paged<SpotifyPlaylist>);
}
