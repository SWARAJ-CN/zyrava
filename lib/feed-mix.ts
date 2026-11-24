import type { Song } from "@/lib/saavn";

/** Shuffle each catalogue and interleave them so the opening page spans languages.
 * Copies the inputs: cached API results must keep their original search order.
 */
export function mixFeedPools<T>(pools: readonly (readonly T[])[], random = Math.random): T[] {
  const shuffle = <V>(values: readonly V[]): V[] => {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const shuffled = shuffle(pools.map((pool) => shuffle(pool)));
  const result: T[] = [];
  const longest = Math.max(0, ...shuffled.map((pool) => pool.length));
  for (let row = 0; row < longest; row++) {
    for (const pool of shuffled) {
      if (row < pool.length) result.push(pool[row]);
    }
  }
  return result;
}


export const MIX_HISTORY_KEY = "zyrava:mix-recent:v1";
export function readMixHistory(raw: string | null): string[] {
  try {
    const values: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(values) ? values.filter((id): id is string => typeof id === "string").slice(0, 30) : [];
  } catch { return []; }
}

/** Fresh chart tracks on every refresh, balanced across available languages. */
export function pickFreshTrending(songs: Song[], previous: string[], limit = 10, random = Math.random): Song[] {
  const recent = new Set(previous);
  const groups = new Map<string, Song[]>();
  const seen = new Set<string>();
  for (const song of songs) {
    if (seen.has(song.id)) continue;
    seen.add(song.id);
    const language = song.language.toLowerCase() || "unknown";
    const pool = groups.get(language) ?? [];
    if (pool.length < 20) pool.push(song);
    groups.set(language, pool);
  }
  const pools = [...groups.values()];
  const fresh = mixFeedPools(pools.map(pool => pool.filter(song => !recent.has(song.id))), random);
  const repeats = mixFeedPools(pools.map(pool => pool.filter(song => recent.has(song.id))), random);
  return [...fresh, ...repeats].slice(0, limit);
}
