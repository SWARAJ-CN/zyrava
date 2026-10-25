"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { searchSongs } from "@/lib/saavn";
import type { Song } from "@/lib/saavn";
import { clearHistory, fetchTasteState, pushEvents, type TasteState } from "@/lib/history";
import {
  WEIGHT,
  appendEvent,
  buildSignature,
  buildVector,
  coldStage,
  exploreShelf,
  markSent,
  mixShelf,
  pendingEvents,
  pendingSongs,
  radioShelf,
  readLog,
  rememberShown,
  repeatShelf,
  shownIds,
  writeLog,
  type EventKind,
  type FetchPool,
  type LogBuffer,
  type Shelf,
  type TasteVector,
} from "@/lib/taste";

/**
 * What the listener does, kept in one place.
 *
 * Every interaction the app can learn from funnels into `record`. Those lines go
 * into a device buffer and, while signed in, on to the account, so the same
 * taste follows the login to another device. The shelves are built from the
 * merged picture: what the account remembers plus whatever has not synced yet.
 *
 * The engine lives outside React on purpose — it owns a write queue, a backoff
 * clock and a re-roll counter, none of which are render state — and it only
 * tells React when something worth showing has changed. Sync is silent: a
 * listener who cannot reach the log server is still playing music, and an error
 * toast about a background write would be a nag.
 */

export interface ShelfSet {
  mix: Shelf | null;
  radio: Shelf | null;
  explore: Shelf | null;
  repeat: Shelf | null;
}

interface Snapshot {
  state: TasteState | null;
  vector: TasteVector | null;
  shelves: ShelfSet | null;
  building: boolean;
  loading: boolean;
  lastShown: string[];
}

interface TasteValue extends Snapshot {
  /** Logs one interaction. `song` is required for anything about a track. */
  record: (kind: EventKind, song?: Song, extra?: { pct?: number; q?: string }) => void;
  /** Starts the first build — the surface calls this when it scrolls into view. */
  ensureBuilt: () => void;
  /** Re-rolls: a fresh draw, a new signature, a visibly different row. */
  refresh: () => void;
  /** Clears the log on this device and on the account. */
  reset: () => Promise<void>;
  stage: ReturnType<typeof coldStage>;
}

const TasteContext = createContext<TasteValue | null>(null);

/** How long a profile read is good for, per account. */
const STATE_TTL = 5 * 60_000;
/** How long built shelves stay good for. */
const SHELF_TTL = 20 * 60_000;
/** Flush when the buffer grows this much. */
const FLUSH_AT = 20;
/** Background write cadence. */
const SYNC_EVERY = 60_000;
/** A new play schedules work this late, never mid-scroll. */
const REBUILD_AFTER = 15_000;

const EMPTY_SNAPSHOT: Snapshot = {
  state: null,
  vector: null,
  shelves: null,
  building: false,
  loading: false,
  lastShown: [],
};

const fetchPool: FetchPool = async (phrase, limit) => {
  const result = await searchSongs(phrase, limit, 1);
  return result.songs;
};

function outgoing(buffer: LogBuffer) {
  return {
    events: pendingEvents(buffer).map((event) => ({
      eid: event.eid,
      kind: event.k,
      songId: event.sid,
      q: event.q,
      w: WEIGHT[event.k],
      pct: event.pct,
      at: event.at,
    })),
    songs: pendingSongs(buffer).map((entry) => ({ songId: entry.song.id, song: entry.song })),
  };
}

/** Reads that are good for a while, and the builds already under way. */
const stateCache = new Map<string, { at: number; value: TasteState }>();
const shelfCache = new Map<string, { at: number; value: ShelfSet; shown: string[] }>();
const buildInFlight = new Map<string, Promise<ShelfSet>>();
const engines = new Map<string, TasteEngine>();

class TasteEngine {
  private readonly userId: string | null;
  private buffer: LogBuffer;
  private state: TasteState | null = null;
  private vector: TasteVector | null = null;
  private shelves: ShelfSet | null = null;
  private lastShown: string[] = [];
  private building = false;
  private salt = 0;
  private failures = 0;
  private builtSig = "";
  private queued: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private snap: Snapshot = EMPTY_SNAPSHOT;
  private alive = true;

  constructor(userId: string | null) {
    this.userId = userId;
    this.buffer = readLog(userId);
    this.vector = this.buffer.events.length ? buildVector(null, this.buffer.events) : null;
    this.rebuild();
  }

  /* ---------------------------------------------------------------- *
   * The React side
   * ---------------------------------------------------------------- */

  snapshot = (): Snapshot => this.snap;

  subscribe = (onChange: () => void): (() => void) => {
    this.listeners.add(onChange);
    return () => {
      this.listeners.delete(onChange);
    };
  };

  private rebuild(): void {
    this.snap = {
      state: this.state,
      vector: this.vector,
      shelves: this.shelves,
      building: this.building,
      loading: false,
      lastShown: this.lastShown,
    };
  }

  private notify(): void {
    this.rebuild();
    for (const listener of this.listeners) listener();
  }

  /** Reads the account log, then keeps the device copy flowing into it. */
  start = (): (() => void) => {
    if (!this.userId) return () => {};
    const userId = this.userId;
    this.alive = true;

    const cached = stateCache.get(userId);
    const loaded =
      cached && Date.now() - cached.at < STATE_TTL
        ? Promise.resolve(cached.value)
        : fetchTasteState()
            .then((value) => {
              stateCache.set(userId, { at: Date.now(), value });
              return value;
            })
            .catch(() => null);

    void loaded.then((value) => {
      if (!this.alive) return;
      if (value) this.state = value;
      this.vector = buildVector(this.state, this.buffer.events, this.storedSongs());
      this.notify();
      void this.flush();
    });

    const timer = setInterval(() => void this.flush(), SYNC_EVERY);
    const onHide = () => {
      if (document.visibilityState === "hidden") void this.flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);

    return () => {
      this.alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      if (this.queued) clearTimeout(this.queued);
      void this.flush();
    };
  };

  /* ---------------------------------------------------------------- *
   * The log
   * ---------------------------------------------------------------- */

  private storedSongs(): Song[] {
    return Object.values(this.buffer.songs).map((entry) => entry.song);
  }

  private persist(): void {
    if (!this.userId) return;
    writeLog(this.userId, this.buffer);
  }

  record = (kind: EventKind, song?: Song, extra?: { pct?: number; q?: string }): void => {
    // Signed out there is nobody to remember it for, and an anonymous buffer
    // would leak one person's taste onto the next account on a shared device.
    if (!this.userId) return;
    if (kind !== "search" && !song) return;

    this.buffer = appendEvent(this.buffer, kind, song, extra);
    this.persist();
    this.vector = buildVector(this.state, this.buffer.events);
    this.notify();

    if (kind === "like" || kind === "unlike" || pendingEvents(this.buffer).length >= FLUSH_AT) {
      void this.flush();
    }
    // The shelves re-read the log on a schedule, never in the middle of a scroll.
    if (song) this.schedule();
  };

  private schedule(): void {
    if (this.queued) return;
    this.queued = setTimeout(() => {
      this.queued = null;
      void this.flush();
      if (this.shelves) void this.build(true);
    }, REBUILD_AFTER);
  }

  /* ---------------------------------------------------------------- *
   * The account copy
   * ---------------------------------------------------------------- */

  private async flush(): Promise<void> {
    if (!this.userId) return;
    const { events, songs } = outgoing(this.buffer);
    if (!events.length || Date.now() < this.buffer.backoffUntil) return;

    const ids = events.map((event) => event.eid);
    try {
      await pushEvents(events, songs);
      this.failures = 0;
      this.buffer = markSent(this.buffer, ids);
      this.persist();
    } catch {
      // Retain and back off: history is a queue that may be late, never lost.
      this.failures += 1;
      const wait = Math.min(30_000 * 2 ** this.failures, 900_000);
      this.buffer = { ...this.buffer, backoffUntil: Date.now() + wait };
      this.persist();
    }
  }

  /* ---------------------------------------------------------------- *
   * The shelves
   * ---------------------------------------------------------------- */

  /**
   * One shelf at a time, top to bottom, inside a round-trip budget. Nothing runs
   * until a surface asks for it, so a listener who never scrolls to the card
   * costs the catalogue no queries.
   */
  async build(force = false): Promise<void> {
    if (!this.userId || !this.vector) return;
    if (this.vector.stage === "empty" || this.building) return;

    const sig = `${this.userId}|${buildSignature(this.vector, this.salt)}|${this.vector.stage}`;
    const cached = shelfCache.get(sig);
    if (cached && !force && Date.now() - cached.at < SHELF_TTL) {
      this.builtSig = sig;
      this.shelves = cached.value;
      this.lastShown = cached.shown;
      this.notify();
      return;
    }
    const running = buildInFlight.get(sig);
    if (running) {
      this.builtSig = sig;
      this.shelves = await running;
      this.notify();
      return;
    }

    this.building = true;
    this.notify();

    const vector = this.vector;
    const shown = [...shownIds(this.buffer)];
    const options = { salt: this.salt, shown };
    const ready = vector.stage === "ready";

    const work = (async (): Promise<ShelfSet> => {
      const repeat = repeatShelf(vector);
      const radio = await radioShelf(vector, fetchPool, options);
      const mix = await mixShelf(vector, fetchPool, {
        ...options,
        limit: ready ? 30 : 12,
        artistCap: ready ? 2 : 3,
      });
      const explore = ready ? await exploreShelf(vector, fetchPool, options) : null;
      return { mix, radio, explore, repeat };
    })();

    buildInFlight.set(sig, work);
    try {
      const value = await work;
      const ids = [value.mix, value.radio, value.explore, value.repeat]
        .filter((shelf): shelf is Shelf => !!shelf)
        .flatMap((shelf) => shelf.picks.map((pick) => pick.song.id));
      this.buffer = rememberShown(this.buffer, ids);
      this.persist();
      shelfCache.set(sig, { at: Date.now(), value, shown: ids });
      this.builtSig = sig;
      this.shelves = value;
      this.lastShown = ids;
    } catch {
      this.builtSig = "";
    } finally {
      buildInFlight.delete(sig);
      this.building = false;
      this.notify();
    }
  }

  ensureBuilt = (): void => {
    if (this.shelves || this.builtSig) return;
    void this.build();
  };

  refresh = (): void => {
    this.salt += 1;
    this.builtSig = "";
    void this.build(true);
  };

  reset = async (): Promise<void> => {
    if (!this.userId) return;
    const userId = this.userId;
    stateCache.delete(userId);
    shelfCache.clear();
    buildInFlight.clear();
    this.buffer = { v: 1, events: [], songs: {}, shown: [], backoffUntil: 0 };
    this.salt = 0;
    this.failures = 0;
    this.builtSig = "";
    this.shelves = null;
    this.lastShown = [];
    try {
      window.localStorage.removeItem(`zyrava:log:${userId}`);
    } catch {
      /* private mode has nothing to clear */
    }
    this.persist();
    await clearHistory().catch(() => null);
    const value = await fetchTasteState().catch(() => null);
    if (value) stateCache.set(userId, { at: Date.now(), value });
    this.state = value;
    this.vector = buildVector(value, [], []);
    this.notify();
  };
}

function engineFor(userId: string | null): TasteEngine {
  if (!userId) return new TasteEngine(null);
  const running = engines.get(userId);
  if (running) return running;
  const created = new TasteEngine(userId);
  engines.set(userId, created);
  return created;
}

export function TasteProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const engine = useMemo(() => engineFor(user?.id ?? null), [user?.id]);

  useEffect(() => engine.start(), [engine]);

  const snapshot = useSyncExternalStore(
    useMemo(() => engine.subscribe, [engine]),
    useMemo(() => engine.snapshot, [engine]),
    () => EMPTY_SNAPSHOT
  );

  const value = useMemo<TasteValue>(
    () => ({
      ...snapshot,
      record: engine.record,
      ensureBuilt: engine.ensureBuilt,
      refresh: engine.refresh,
      reset: engine.reset,
      stage: coldStage(snapshot.vector?.events ?? 0),
    }),
    [engine, snapshot]
  );

  return <TasteContext.Provider value={value}>{children}</TasteContext.Provider>;
}

export function useTaste(): TasteValue {
  const context = useContext(TasteContext);
  if (!context) throw new Error("useTaste must be used inside TasteProvider");
  return context;
}
