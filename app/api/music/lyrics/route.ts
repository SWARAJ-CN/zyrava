import { LyricsUpstreamError, lookupLyrics, type LyricsOutcome } from "@/lib/lrclib";

export const dynamic = "force-dynamic";

const MAX_DURATION = 6 * 3600;

function readInt(value: string | null, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * The shape the panel renders, so no component has to know what LRC is.
 *
 * "Not in the database" is a product outcome rather than a failure, so it
 * answers 200 with a reason and leaves the client to show it plainly.
 */
function payload(outcome: LyricsOutcome): Record<string, unknown> {
  if (outcome.status === "none") return { found: false, reason: outcome.reason };

  const { result } = outcome;
  const base = { found: true, matched: result.matched, drift: result.drift };
  return result.body.kind === "timed"
    ? { ...base, kind: "timed", lines: result.body.lines }
    : { ...base, kind: "plain", stanzas: result.body.stanzas, drift: false };
}

const UNAVAILABLE = { error: "Couldn't reach the lyrics service." };

/**
 * Lyrics for the track that is playing.
 *
 * Server-side like the catalogue search: the provider is asked from here so the
 * shared cache and the per-IP rate limit work for every listener at once, and
 * so a browser never learns which lyrics service is behind this.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get("title") ?? "").trim();

  if (!title) {
    return Response.json({ error: "Give me something to search for." }, { status: 400 });
  }

  try {
    const outcome = await lookupLyrics({
      title,
      artist: (searchParams.get("artist") ?? "").trim(),
      album: (searchParams.get("album") ?? "").trim(),
      duration: readInt(searchParams.get("duration"), 0, MAX_DURATION, 0),
    });
    return Response.json(payload(outcome), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof LyricsUpstreamError && error.status === 429) {
      return Response.json(
        { error: "The lyrics service is rate limiting us — try again in a moment." },
        { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } }
      );
    }
    return Response.json(UNAVAILABLE, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
