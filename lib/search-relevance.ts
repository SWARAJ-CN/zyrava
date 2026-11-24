import type { Song } from "./saavn";

export function normalizeSearch(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

const VERSIONS = [
  /\binstrumental\b/, /\bkaraoke\b/, /\bremix(?:ed)?\b|\b(?:club|house|dance|extended|dub|\d{4}) mix\b/, /\blo fi\b|\blofi\b/,
  /\bslowed\b/, /\breverb\b/, /\bsped up\b/, /\bcover\b|\btribute\b/,
  /\bvariation\b|\brework\b/, /\blive\b/, /\bacoustic\b/, /\bpiano\b/, /\bringtone\b/,
];

export function searchIntent(query: string) {
  const cleaned = query.trim().replace(/\s+/g, " ");
  // A literal title such as "Stand by Me" should not be split into an artist.
  const split = /^(.*?)\s+by\s+(.{3,})$/i.exec(cleaned);
  const title = split?.[1] || cleaned;
  const artist = split?.[2] || "";
  return { title: normalizeSearch(title), artist: normalizeSearch(artist),
    query: normalizeSearch(cleaned), titleQuery: title, catalogueQuery: artist ? `${title} ${artist}` : cleaned };
}

/** Tolerate a small artist typo, including adjacent transpositions (engima/enigma). */
function wordMatch(a: string, b: string): number {
  if (a === b) return 1;
  if (Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > 1) return 0;
  if (a.length === b.length) {
    const changed = [...a].map((c, i) => c !== b[i] ? i : -1).filter((i) => i >= 0);
    if (changed.length === 1) return 0.85;
    if (changed.length === 2 && changed[1] === changed[0] + 1 &&
      a[changed[0]] === b[changed[1]] && a[changed[1]] === b[changed[0]]) return 0.85;
  }
  const short = a.length < b.length ? a : b;
  const long = a.length < b.length ? b : a;
  if (long.length === short.length + 1) {
    for (let i = 0; i < long.length; i++) {
      if (long.slice(0, i) + long.slice(i + 1) === short) return 0.85;
    }
  }
  return 0;
}

function coverage(needle: string, haystack: string): number {
  const words = needle.split(" ").filter(Boolean);
  const candidates = haystack.split(" ");
  return words.length ? words.reduce((sum, word) => sum + Math.max(0, ...candidates.map((other) => wordMatch(word, other))), 0) / words.length : 0;
}

export function recordingVersion(song: Pick<Song, "title" | "album">): string {
  const text = normalizeSearch(`${song.title} ${song.album}`);
  return VERSIONS.map((pattern, i) => pattern.test(text) ? i : -1).filter((i) => i >= 0).join(",");
}

export function searchRelevance(song: Song, query: string): { score: number; confident: boolean } {
  const intent = searchIntent(query);
  const title = normalizeSearch(song.title.replace(/\s*[([]from\s+.*?[)\]]/gi, ""));
  const artist = normalizeSearch(song.artist);
  const album = normalizeSearch(song.album);
  const versionArtist = /\binstrumental\b|\bkaraoke\b|\btribute\b/.test(artist) ? artist : "";
  const unwanted = VERSIONS.filter((pattern) => !pattern.test(intent.query) && pattern.test(`${title} ${album} ${versionArtist}`)).length;
  let requestedTitle = intent.title;
  if (!intent.artist && artist && artist !== "various artists") {
    const queryWords = intent.title.split(" ");
    const artistWords = artist.split(" ");
    if (queryWords.length > artistWords.length) {
      const count = artistWords.length;
      if (coverage(artist, queryWords.slice(-count).join(" ")) >= 0.8) {
        requestedTitle = queryWords.slice(0, -count).join(" ");
      } else if (coverage(artist, queryWords.slice(0, count).join(" ")) >= 0.8) {
        requestedTitle = queryWords.slice(count).join(" ");
      }
    }
  }
  const titleCoverage = coverage(requestedTitle, title);
  const combinedCoverage = coverage(intent.title, `${title} ${artist}`);
  const artistCoverage = coverage(intent.artist, artist);
  const exact = title === requestedTitle;
  // Album metadata is supporting evidence, never a substitute for title/artist.
  const score = (exact ? 160 : 0) + titleCoverage * 60 + combinedCoverage * 30
    + (intent.artist ? artistCoverage * 100 - (1 - artistCoverage) * 100 : 0)
    + coverage(intent.title, album) * 4 - unwanted * 180;
  return { score, confident: exact && unwanted === 0 && (!intent.artist || artistCoverage >= 0.8) };
}

export function rankSearchResults(songs: Song[], query: string): Song[] {
  return songs.map((song, index) => ({ song, index, score: searchRelevance(song, query).score }))
    .sort((a, b) => b.score - a.score || a.index - b.index).map(({ song }) => song);
}
