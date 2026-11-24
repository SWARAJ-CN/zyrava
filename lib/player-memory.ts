import type { Song } from "@/lib/saavn";

export const LAST_PLAYED_KEY = "zyrava:last-played:v1";
export interface LastPlayed { song: Song; position: number }

/** Ignore incomplete or obsolete stored entries instead of breaking the player. */
export function readLastPlayed(raw: string | null): LastPlayed | null {
  try {
    if (!raw || raw.length > 40000) return null;
    const value = JSON.parse(raw) as LastPlayed;
    const song = value?.song;
    if (!song || ["id", "title", "artist", "album", "year", "language", "image", "imageLarge", "streamUrl", "pageUrl"].some(key => typeof (song as unknown as Record<string, unknown>)[key] !== "string")) return null;
    if (!song.id || !song.title || !Number.isFinite(song.duration) || song.duration < 0) return null;
    if (song.offline) {
      if (!["download", "local"].includes(song.offline.kind) || typeof song.offline.id !== "string" || !song.offline.id) return null;
    } else if (!/^https?:\/\//.test(song.streamUrl)) return null;
    const position = Number.isFinite(value.position) ? Math.max(0, Math.min(value.position, song.duration || value.position)) : 0;
    return { song, position };
  } catch { return null; }
}

export function serializeLastPlayed(song: Song, position: number): string {
  return JSON.stringify({ song, position: Number.isFinite(position) ? Math.max(0, position) : 0 });
}
