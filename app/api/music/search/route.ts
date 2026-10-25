import { MusicApiError, searchSongs } from "@/lib/saavn";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 30;

function readInt(value: string | null, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Server-side proxy for the JioSaavn catalogue. The base URL lives in
 * `MUSIC_API` and is only readable here, and proxying avoids CORS issues in
 * the browser.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();
  const limit = readInt(searchParams.get("limit"), 1, MAX_LIMIT, DEFAULT_LIMIT);
  const page = readInt(searchParams.get("page"), 1, 999, 1);

  if (!query) {
    return Response.json({ error: "Give me something to search for." }, { status: 400 });
  }

  try {
    // The catalogue lists the same recording several times (re-releases,
    // "(From …)" spellings), so ask for headroom and hand back the first
    // `limit` unique tracks.
    const fetchLimit = Math.min(MAX_LIMIT, Math.max(limit, Math.ceil(limit * 1.7)));
    const { songs, total } = await searchSongs(query, fetchLimit, page);
    return Response.json(
      { songs: songs.slice(0, limit), total, page, limit },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof MusicApiError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: "The music service is unavailable right now." },
      { status: 502 }
    );
  }
}
