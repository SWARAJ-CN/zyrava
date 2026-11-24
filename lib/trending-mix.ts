import { dedupeSongs, getPlaylistDetail, type Song } from "@/lib/saavn";

// JioSaavn's continuously updated editorial charts (not title-search results).
const MIX_CHARTS = ["1134595537", "1134543272", "1134651042", "1134705865"];
const CACHE_MS = 10 * 60 * 1000;
let cached: { at: number; songs: Song[] } | null = null;
let pending: Promise<Song[]> | null = null;

/** Preserve each chart's ranking while giving every language a turn. */
export function interleaveCharts(pools: readonly (readonly Song[])[]): Song[] {
  const ordered: Song[] = [];
  const longest = Math.max(0, ...pools.map((pool) => pool.length));
  for (let rank = 0; rank < longest; rank++) {
    for (const pool of pools) if (pool[rank]) ordered.push(pool[rank]);
  }
  return dedupeSongs(ordered);
}

/** Charts have a bounded load time; ordinary Mix remains the fallback. */
function chartSongs(id: string): Promise<Song[]> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve([]), 4500);
    getPlaylistDetail(id).then(
      (playlist) => { clearTimeout(timer); resolve(playlist?.songs ?? []); },
      () => { clearTimeout(timer); resolve([]); },
    );
  });
}

export function getTrendingMix(): Promise<Song[]> {
  if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.songs);
  if (pending) return pending;
  pending = Promise.all(MIX_CHARTS.map(chartSongs)).then((pools) => {
    const songs = interleaveCharts(pools);
    if (songs.length) cached = { at: Date.now(), songs };
    return songs.length ? songs : cached?.songs ?? [];
  }).finally(() => { pending = null; });
  return pending;
}
