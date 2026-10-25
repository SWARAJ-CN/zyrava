import { getPlaylistDetail } from "@/lib/saavn";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** One catalogue playlist with its playable tracks. */
export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) return Response.json({ error: "Missing playlist id." }, { status: 400 });

  try {
    const playlist = await getPlaylistDetail(id);
    if (!playlist) {
      return Response.json({ error: "That playlist was not found." }, { status: 404 });
    }
    return Response.json({ playlist }, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch {
    return Response.json({ error: "That playlist is unavailable right now." }, { status: 502 });
  }
}
