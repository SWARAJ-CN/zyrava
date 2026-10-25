import { matchesRegions, matchesVibe, type Vibe } from "@/components/features/music/filters";
import type { Song } from "@/lib/saavn";

/** Words in a free-text query, lowercased and stripped of punctuation. */
function queryWords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/gu)
    .filter((word) => word.length > 1);
}

export interface RankingContext {
  /** Typed search phrase, or "" when browsing a region. */
  query?: string;
  vibes?: Vibe[];
  regionLabels?: string[];
  /** Max tracks from one artist in the result; keeps a page from going stale. */
  artistCap?: number;
}

/**
 * Relevance-first ranking for a pooled set of results.
 *
 * 1. typed words count most when they appear in the title (+5) and less in
 *    artist/album (+2); a title containing every word is an exact hit (+6)
 * 2. each checked vibe earns +3 and a matching language +2
 * 3. ties keep the catalogue's own order, so plain region browsing is stable
 * 4. an artist cap (default 2) spreads the page across voices; capped tracks
 *    still appear at the end if there is room
 */
export function rankSongs(songs: Song[], context: RankingContext = {}): Song[] {
  const words = queryWords(context.query ?? "");
  const vibes = context.vibes ?? [];
  const regions = context.regionLabels ?? [];
  const artistCap = context.artistCap ?? 2;

  const scored = songs.map((song, position) => {
    const title = song.title.toLowerCase();
    const haystack = `${song.title} ${song.artist} ${song.album}`.toLowerCase();
    let score = 0;

    for (const word of words) {
      if (title.includes(word)) score += 5;
      else if (haystack.includes(word)) score += 2;
    }
    if (words.length > 0 && words.every((word) => title.includes(word))) score += 6;
    for (const vibe of vibes) {
      if (matchesVibe(song, vibe)) score += 3;
    }
    if (regions.length > 0 && matchesRegions(song, regions)) score += 2;

    return { song, score, position, artist: song.artist.toLowerCase() };
  });

  // Stable: equal scores keep the order the catalogue returned them in.
  scored.sort((a, b) => b.score - a.score || a.position - b.position);

  const preferred: Song[] = [];
  const deferred: Song[] = [];
  const perArtist = new Map<string, number>();

  for (const entry of scored) {
    const used = perArtist.get(entry.artist) ?? 0;
    if (used < artistCap) {
      perArtist.set(entry.artist, used + 1);
      preferred.push(entry.song);
    } else {
      deferred.push(entry.song);
    }
  }

  return [...preferred, ...deferred];
}
