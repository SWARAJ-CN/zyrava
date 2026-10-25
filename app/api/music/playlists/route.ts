import { MusicApiError, searchPlaylists } from "@/lib/saavn";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 16;

/** Catalogue playlists for the home search. Cached briefly at the edge. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();
  const requested = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(requested)
    ? Math.min(MAX_LIMIT, Math.max(1, requested))
    : DEFAULT_LIMIT;

  if (!query) {
    return Response.json({ error: "Give me something to search for." }, { status: 400 });
  }

  try {
    const result = await searchPlaylists(query, limit);
    if (!result) {
      return Response.json(
        { error: "Playlists are unavailable right now." },
        { status: 502 }
      );
    }
    return Response.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    if (error instanceof MusicApiError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "Playlists are unavailable right now." }, { status: 502 });
  }
}
