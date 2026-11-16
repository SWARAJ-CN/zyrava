/**
 * Lyrics timing — the LRC format lrclib serves, reduced to plain numbers.
 *
 * Pure and dependency-free on purpose: the route handler parses before anything
 * reaches a browser, and the panel needs `activeLineIndex` to follow along while
 * the song plays. Nothing here may import the catalogue or the radio engine —
 * both pull in node-forge and component code, which a route handler and a list
 * row should not have to carry.
 */

export interface LyricLine {
  /** Seconds from the top of the track, with any offset already applied. */
  start: number;
  /** When the next line takes over — `Infinity` on the last one. */
  end: number;
  text: string;
}

/** What the app knows about the playing track, in the shape a lookup needs. */
export interface LyricsSeed {
  title: string;
  artist: string;
  album: string;
  /** Seconds, from the catalogue — never the live element, so the parse ceiling is stable. */
  duration: number;
}

/** The record that was actually matched, for the panel to be honest about. */
export interface LyricsMatch {
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
}

export type LyricsBody =
  | { kind: "timed"; lines: LyricLine[] }
  | { kind: "plain"; stanzas: string[] };

export interface LyricsResult {
  body: LyricsBody;
  matched: LyricsMatch;
  /** The matched version runs a different length from the stream. */
  drift: boolean;
}

/** A pathological file must not hand the panel ten thousand rows. */
const MAX_LINES = 400;

/** `[mm:ss]`, `[mm:ss.xx]`, `[mm:ss.xxx]`, `[mm:ss:xx]`, up to 3-digit minutes. */
const TIME_TAG = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;

/** `[+00:01.20]` / `[-0:01.20]` — a shift applied to every timestamp. */
const OFFSET_TAG = /^\[([+-])(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;

/** Any other bracket is metadata: `[ar:] [au:] [al:] [by:] [length:] [ve:] [evidence:]`… */
const METADATA_TAG = /^\[([^\]:]+):([^\]]*)\]/;

/** Credits are listed every which way by every source. */
const CREDIT_SPLIT = /[,;&/]|feat\.|ft\.|vs\.|versus/i;

export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s*[([].*?[)\]]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `"A, B & C feat. D"` → the individual credits, normalised and de-duplicated. */
export function artistCredits(value: string): string[] {
  const parts = value
    .normalize("NFKC")
    .toLowerCase()
    .split(CREDIT_SPLIT)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return [...new Set(parts)];
}

/** `0.5` → `500` ms. A tenth is `x` digits wide, a millisecond three. */
function fractionToMs(fraction: string | undefined): number {
  if (!fraction) return 0;
  const padded = (fraction + "000").slice(0, 3);
  return Number.parseInt(padded, 10);
}

/**
 * LRC → ordered lines with real boundaries.
 *
 * `ceiling` drops timestamps that belong to a longer version of the recording;
 * pass the length the timing map was written against, or nothing to keep it all.
 */
export function parseLrc(raw: string, ceiling?: number): LyricLine[] {
  let offsetMs = 0;
  const timed: Array<{ start: number; text: string }> = [];

  for (const physicalLine of raw.split(/\r?\n/)) {
    let rest = physicalLine.trim();
    if (!rest) continue;

    const starts: number[] = [];

    /* Leading tags, several of them legal on one line. */
    for (;;) {
      const time = TIME_TAG.exec(rest);
      if (time) {
        starts.push(
          Number(time[1]) * 60_000 + Number(time[2]) * 1_000 + fractionToMs(time[3])
        );
        rest = rest.slice(time[0].length).trim();
        continue;
      }

      const offset = OFFSET_TAG.exec(rest);
      if (offset) {
        const ms =
          Number(offset[2]) * 60_000 + Number(offset[3]) * 1_000 + fractionToMs(offset[4]);
        offsetMs += offset[1] === "-" ? -ms : ms;
        rest = rest.slice(offset[0].length).trim();
        continue;
      }

      const metadata = METADATA_TAG.exec(rest);
      if (metadata) {
        if (normalizeText(metadata[1]) === "offset") {
          const shift = Number.parseFloat(metadata[2]);
          if (Number.isFinite(shift)) offsetMs += shift * 1000;
        }
        rest = rest.slice(metadata[0].length).trim();
        continue;
      }

      break;
    }

    if (!starts.length) continue;

    /* A timed line with no words is an instrumental gap. Dropping it keeps the
     * highlight resting on the last real line instead of blanking out, and every
     * row the panel renders is then worth tapping. */
    const text = rest.replace(/[\[\]]/g, " ").replace(/\s+/g, " ").trim();
    if (!text) continue;

    for (const start of starts) {
      timed.push({ start: Math.max(0, (start + offsetMs) / 1000), text });
    }
  }

  timed.sort((a, b) => a.start - b.start);

  const kept: LyricLine[] = [];
  for (const entry of timed) {
    if (kept.length >= MAX_LINES) break;
    if (ceiling !== undefined && entry.start >= ceiling + 2) break;
    // Two tags on the same instant: first one wins, one row per moment.
    if (kept.length && kept[kept.length - 1].start === entry.start) continue;
    kept.push({ start: entry.start, end: Infinity, text: entry.text });
  }

  for (let index = 0; index < kept.length - 1; index += 1) {
    kept[index].end = kept[index + 1].start;
  }

  return kept;
}

/** Blank-line separated paragraphs, collapsed so the block never ratchets. */
export function plainToStanzas(plain: string): string[] {
  return plain
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((stanza) =>
      stanza
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join("\n")
        .trim()
    )
    .filter(Boolean);
}

/**
 * Which line is being sung at `time`.
 *
 * A walk from the back, because the caller asks on every tick and the answer is
 * almost always the current line or the next one — a binary search over a list
 * that is only ever probed near its tail would do more work, not less.
 */
export function activeLineIndex(lines: LyricLine[], time: number): number {
  if (!lines.length || !Number.isFinite(time)) return -1;
  if (time < lines[0].start) return -1;

  let index = lines.length - 1;
  while (index > 0 && lines[index].start > time) index -= 1;
  return index;
}

export function formatSeconds(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
