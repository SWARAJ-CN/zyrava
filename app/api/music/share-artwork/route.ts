import { allowedShareArtwork } from "@/lib/song-share";

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url") ?? "";
  if (!allowedShareArtwork(url)) return new Response("Unsupported artwork", { status: 400 });
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(8000) });
    const type = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (!response.ok || !["image/jpeg", "image/png", "image/webp"].includes(type)) {
      return new Response("Artwork unavailable", { status: 502 });
    }
    const reader = response.body?.getReader();
    if (!reader) return new Response("Artwork unavailable", { status: 502 });
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 5 * 1024 * 1024) {
        await reader.cancel();
        return new Response("Artwork too large", { status: 413 });
      }
      chunks.push(value);
    }
    return new Response(new Blob(chunks, { type }), {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response("Artwork unavailable", { status: 502 });
  }
}
