import { apiFetch } from "@/lib/api";
import type { Song } from "@/lib/saavn";

/**
 * The account server's listening-history endpoints. Every call is scoped to the
 * signed-in account by its access token, so no user id is ever sent.
 *
 * The server stores the facts — an event log plus the track snapshots needed to
 * replay it — and the browser owns the taste model built from them.
 */

/** What the server knows about one recording, in aggregate. */
export interface HeardRecord {
  sid: string;
  plays: number;
  skips: number;
  score: number;
  /** ISO timestamp of the last event for this track. */
  last: string;
}

export interface NamedScore {
  name: string;
  score: number;
}

/** The compact taste profile read back from the account log. */
export interface TasteState {
  /** Total events stored for this account. */
  events: number;
  /** ISO timestamp of the oldest event, or null when the log is empty. */
  since: string | null;
  /** Playable snapshots, newest first, for the tracks the log mentions most. */
  songs: Song[];
  heard: HeardRecord[];
  artists: NamedScore[];
  languages: NamedScore[];
  queries: Array<{ q: string; at: string }>;
}

export interface IngestResult {
  accepted: number;
  duplicates: number;
  rejected: number;
}

/** Events per request: the ceiling the API accepts in one body. */
const EVENT_CHUNK = 20;
/** Snapshots per request — each one is a full track record, so this stays low. */
const SONG_CHUNK = 10;

export function fetchTasteState(): Promise<TasteState> {
  return apiFetch<TasteState>("/api/library/history/state");
}

/** A log line as the account server stores it. */
export interface OutgoingEvent {
  eid: string;
  kind: string;
  songId?: string;
  q?: string;
  w: number;
  pct?: number;
  /** Epoch milliseconds; the server clamps it into a believable range. */
  at: number;
}

/** Tracks the server has not been given a snapshot for yet. */
export interface OutgoingSong {
  songId: string;
  song: Song;
}

/**
 * Sends one batch of events with the snapshots they reference. Both lists are
 * chunked and the chunks go out one at a time: history is a background write,
 * so it must never compete with the requests the listener is waiting on.
 */
export async function pushEvents(
  events: OutgoingEvent[],
  songs: OutgoingSong[]
): Promise<IngestResult> {
  const totals: IngestResult = { accepted: 0, duplicates: 0, rejected: 0 };

  const snapshots = new Map(songs.map((entry) => [entry.songId, entry] as const));
  const eventGroups: OutgoingEvent[][] = [];
  for (let index = 0; index < events.length; index += EVENT_CHUNK) {
    eventGroups.push(events.slice(index, index + EVENT_CHUNK));
  }
  if (!eventGroups.length) eventGroups.push([]);

  for (const group of eventGroups) {
    // Only the snapshots this group's events actually reference.
    const wanted = new Set(group.map((event) => event.songId).filter((id): id is string => !!id));
    const body: OutgoingSong[] = [];
    for (const id of wanted) {
      const entry = snapshots.get(id);
      if (entry) body.push(entry);
      if (body.length >= SONG_CHUNK) break;
    }
    const result = await apiFetch<IngestResult>("/api/library/history/events", {
      method: "POST",
      body: { events: group, songs: body },
    });
    if (!result) continue;
    totals.accepted += result.accepted;
    totals.duplicates += result.duplicates;
    totals.rejected += result.rejected;
  }

  return totals;
}

/** How many rows went away, per collection. */
export interface RemovedCounts {
  events: number;
  songs: number;
}

export function clearHistory(): Promise<{ removed: RemovedCounts }> {
  return apiFetch<{ removed: RemovedCounts }>("/api/library/history/clear", { method: "POST", body: {} });
}
