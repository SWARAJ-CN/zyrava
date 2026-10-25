import { searchSongs } from "@/lib/saavn";

export interface TrendingSlide {
  id: string;
  title: string;
  artist: string;
  language: string;
  image: string;
}

const QUERIES = ["trending songs", "top hits", "new releases"];
const MAX_SLIDES = 8;
const CACHE_MS = 5 * 60 * 1000;

let cache: { at: number; slides: TrendingSlide[] } | null = null;

/** Same recording from two trend queries collapses into one slide. */
function slideKey(title: string, artist: string) {
  return `${title.toLowerCase().replace(/\s*[([].*?[)\]]\s*/g, " ").trim()}|${artist
    .toLowerCase()
    .trim()}`;
}

/** Bound the login page's render: a slow catalogue must not hold the form. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

/**
 * Server-side "Trending now" feed for the auth screen. Cached in memory for a
 * few minutes so opening /login never fans out to the catalogue API each time.
 */
export async function getTrendingSlides(): Promise<TrendingSlide[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.slides;

  const results = await Promise.all(
    QUERIES.map((query) => withTimeout(searchSongs(query, 6, 1), 2_500))
  );

  const seen = new Set<string>();
  const slides: TrendingSlide[] = [];

  for (const result of results) {
    for (const song of result?.songs ?? []) {
      const image = song.imageLarge || song.image;
      if (!song.title || !image) continue;
      const key = slideKey(song.title, song.artist);
      if (seen.has(key)) continue;
      seen.add(key);
      slides.push({
        id: song.id,
        title: song.title,
        artist: song.artist,
        language: song.language,
        image,
      });
      if (slides.length >= MAX_SLIDES) break;
    }
    if (slides.length >= MAX_SLIDES) break;
  }

  if (slides.length) cache = { at: Date.now(), slides };
  return slides;
}
