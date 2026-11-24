import { getTrendingMix } from "@/lib/trending-mix";

export async function GET() {
  const songs = (await getTrendingMix()).slice(0, 80);
  return Response.json({ songs }, {
    headers: { "Cache-Control": songs.length ? "public, s-maxage=300, stale-while-revalidate=300" : "no-store" },
  });
}
