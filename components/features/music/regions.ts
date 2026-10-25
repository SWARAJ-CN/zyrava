/**
 * The regions the library can open with. Selecting a region loads its own
 * catalogue from the music API, so the home screen always starts with the
 * sound of a language rather than one global mix.
 */
export interface Region {
  /** Display name, also the queue label used by the player. */
  label: string;
  /** Catalogue queries for this region (one is typically enough). */
  queries: string[];
  /** One-line mood description shown under the name. */
  hint: string;
  /** Fallback cover gradient while artwork loads. */
  tone: string;
}

export const REGIONS: Region[] = [
  {
    label: "Malayalam",
    queries: ["malayalam songs"],
    hint: "Kerala melodies",
    tone: "var(--chart-3)",
  },
  {
    label: "Tamil",
    queries: ["tamil songs"],
    hint: "Kollywood beats",
    tone: "var(--chart-4)",
  },
  {
    label: "Hindi",
    queries: ["hindi songs"],
    hint: "Bollywood & classics",
    tone: "var(--chart-2)",
  },
  {
    label: "Telugu",
    queries: ["telugu songs"],
    hint: "Tollywood hits",
    tone: "var(--chart-1)",
  },
  {
    label: "Punjabi",
    queries: ["punjabi songs"],
    hint: "Bhangra energy",
    tone: "var(--chart-5)",
  },
  {
    label: "English",
    queries: ["top english hits"],
    hint: "Global pop & rock",
    tone: "var(--chart-6)",
  },
];
