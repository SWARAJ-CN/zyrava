"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import { FullscreenLyrics } from "./FullscreenLyrics";
import { Icon } from "@/components/ui/icons";
import { useMusicPlayer } from "@/components/providers/MusicPlayerProvider";
import {
  activeLineIndex,
  formatSeconds,
  type LyricLine,
  type LyricsBody,
  type LyricsMatch,
  type LyricsResult,
} from "@/lib/lyrics";
import type { Song } from "@/lib/saavn";
import { cn } from "@/lib/cn";

/** A track's lyrics run for a day — the provider's answer rarely changes. */
const TTL = 24 * 60 * 60 * 1000;

/** How long a hand on the wheel or the screen suspends the auto-scroll. */
const HOLD_MS = 5000;

/**
 * How far past the last `progress` reading the clock may reach on its own.
 * A stream that stalls mid-play costs at most this much early highlighting,
 * instead of running ahead for as long as it is silent.
 */
const REACH_MS = 700;

/** The longest glide to a new line. Short hops between neighbours finish sooner. */
const GLIDE_MS = 720;

/** easeInOutCubic: leaves gently, arrives gently, so lines never snap. */
function eased(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

/** Read per move, not once at mount — the setting can change while we sit here. */
function readsSteady(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Lines near the one being sung stay readable, the rest recede.
 *
 * Only a handful of rows ever change value, so a line flip starts a couple of
 * fades rather than one per row.
 */
function spotlight(index: number, active: number): number {
  if (active < 0) return 0.75;
  const away = Math.abs(index - active);
  if (away === 0) return 1;
  return Math.max(0.34, 0.8 - (away - 1) * 0.1);
}

type LyricsState =
  | { kind: "ready"; result: LyricsResult }
  | { kind: "none" }
  | { kind: "instrumental" }
  /** A failed request, never cached: the Retry button is the recovery. */
  | { kind: "error" };

const store = new Map<string, { at: number; state: LyricsState }>();

function cachedState(id: string): LyricsState | undefined {
  const entry = store.get(id);
  return entry && Date.now() - entry.at < TTL ? entry.state : undefined;
}

/** Live request for one song id — a reopen during the fetch reuses it. */
const inflight = new Map<string, Promise<LyricsState>>();

interface LyricsPayload {
  found?: boolean;
  reason?: string;
  kind?: string;
  lines?: LyricLine[];
  stanzas?: string[];
  drift?: boolean;
  matched?: Partial<LyricsMatch>;
}

const NO_MATCH: LyricsMatch = {
  trackName: "",
  artistName: "",
  albumName: "",
  duration: 0,
};

function timedState(lines: LyricLine[], payload: LyricsPayload): LyricsState {
  return {
    kind: "ready",
    result: {
      body: { kind: "timed", lines },
      matched: { ...NO_MATCH, ...payload.matched },
      drift: Boolean(payload.drift),
    },
  };
}

/**
 * One lyrics request. A non-2xx is an outage or a rate limit, never "this song
 * has no words", so the two states stay distinguishable.
 */
async function fetchLyrics(song: Song): Promise<LyricsState> {
  const params = new URLSearchParams({
    title: song.title,
    artist: song.artist,
    album: song.album,
    duration: String(Math.round(song.duration || 0)),
  });

  const response = await fetch(`/api/music/lyrics?${params}`, {
    cache: "no-store",
  });
  if (!response.ok) return { kind: "error" };

  const payload = (await response
    .json()
    .catch(() => null)) as LyricsPayload | null;
  if (!payload) return { kind: "error" };
  if (payload.found !== true) {
    return payload.reason === "instrumental"
      ? { kind: "instrumental" }
      : { kind: "none" };
  }

  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  if (payload.kind === "timed" && lines.length >= 2)
    return timedState(lines, payload);

  const stanzas = Array.isArray(payload.stanzas)
    ? payload.stanzas.filter(Boolean)
    : [];
  if (payload.kind === "plain" && stanzas.length) {
    return {
      kind: "ready",
      result: {
        body: { kind: "plain", stanzas },
        matched: { ...NO_MATCH, ...payload.matched },
        drift: false,
      },
    };
  }

  return { kind: "none" };
}

/* ------------------------------------------------------------------ *
 * The clock.
 * ------------------------------------------------------------------ */

/**
 * Which line is being sung, resolved on frames rather than on state ticks.
 *
 * `progress` lands about four times a second, so an index read straight off it
 * can light up a quarter of a second after the word arrives. The reading is
 * anchored to a wall clock instead and stretched between ticks at the player's
 * own rate, which puts every flip within a frame of its timestamp — and stops
 * stretching the moment the reading disagrees, so a seek or a stall cannot
 * compound.
 *
 * Nothing here changes the audio. `progress` is only read.
 */
function useLyricClock(id: string, lines: LyricLine[] | null): number {
  const { progress, playing, rate } = useMusicPlayer();

  const [shown, setShown] = useState<{ id: string; index: number } | null>(
    null,
  );
  const anchor = useRef({ time: progress, wall: 0 });
  const last = useRef(-2);

  /* Every fresh reading re-bases the clock on the player's own number. */
  useEffect(() => {
    anchor.current = { time: progress, wall: performance.now() };
  }, [progress]);

  useEffect(() => {
    if (!lines?.length) return;
    last.current = -2;

    let handle = requestAnimationFrame(function step(now) {
      handle = requestAnimationFrame(step);
      const base = anchor.current;
      const reach = Math.min(REACH_MS, now - base.wall) / 1000;
      const index = activeLineIndex(
        lines,
        base.time + reach * (rate || 1) * (playing ? 1 : 0),
      );
      if (index === last.current) return;
      last.current = index;
      setShown({ id, index });
    });
    return () => cancelAnimationFrame(handle);
  }, [id, lines, playing, rate]);

  // The cache answers for the current song; a landing from another seed is
  // ignored, and a frame of the derived value is invisible.
  return shown?.id === id
    ? shown.index
    : lines
      ? activeLineIndex(lines, progress)
      : -1;
}

/* ------------------------------------------------------------------ *
 * The rows.
 *
 * Split out and memoised because `progress` re-renders every consumer of the
 * player context about four times a second, and sixty lyric rows must not
 * reconcile at that rate — they change once per sung line. So this component
 * takes the active index as a prop and deliberately does not read the player
 * itself; that is the one rule keeping the list cheap.
 * ------------------------------------------------------------------ */
const LyricsRows = memo(function LyricsRows({
  body,
  active,
  onSeek,
  immersive = false,
}: {
  body: LyricsBody;
  active: number;
  onSeek: (time: number) => void;
  immersive?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const rowsRef = useRef<Array<HTMLButtonElement | null>>([]);
  /** First paint and a tap-seek land where they are told; they do not travel. */
  const instantRef = useRef(true);
  const holdUntilRef = useRef(0);
  const [held, setHeld] = useState(false);

  /* Where the list actually sits, fractional. `scrollTop` only answers whole
   * pixels, so the remainder rides on the track as a transform — that last
   * sub-pixel is the difference between a glide and a staircase. */
  const atRef = useRef(0);
  const frameRef = useRef(0);

  const timed = body.kind === "timed";
  const lines = timed ? body.lines : [];

  const centre = useCallback((index: number): number | null => {
    const box = boxRef.current;
    const row = rowsRef.current[index];
    if (!box || !row || index < 0) return null;

    /* Rectangles, not offsetTop: they stay correct whatever wrappers appear.
     * scrollIntoView is not used because it also scrolls the document. */
    const fromContentTop =
      row.getBoundingClientRect().top -
      box.getBoundingClientRect().top +
      box.scrollTop;
    /* The browser's own ceiling: the last lines have no content below them, so
     * they rest above the floor instead of dead centre, which is what every
     * player does and is still fully in view. */
    const room = Math.max(0, box.scrollHeight - box.clientHeight);
    return Math.min(
      Math.max(fromContentTop - (box.clientHeight - row.offsetHeight) / 2, 0),
      room,
    );
  }, []);

  const paint = useCallback((value: number) => {
    const box = boxRef.current;
    if (!box) return;
    atRef.current = value;
    const whole = Math.round(value);
    if (box.scrollTop !== whole) box.scrollTop = whole;
    const track = trackRef.current;
    if (track) {
      const remainder = value - whole;
      track.style.transform = remainder
        ? `translate3d(0, ${remainder.toFixed(3)}px, 0)`
        : "";
    }
  }, []);

  const move = useCallback(
    (index: number) => {
      if (index < 0 || Date.now() < holdUntilRef.current) return;
      const to = centre(index);
      if (to === null) return;

      const from = boxRef.current?.scrollTop ?? atRef.current;
      const distance = Math.abs(to - from);
      const settle = instantRef.current || readsSteady() || distance < 3;
      instantRef.current = false;
      if (settle) {
        paint(to);
        return;
      }

      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      const started = performance.now();
      const ms = Math.min(GLIDE_MS, 240 + distance * 1.5);
      const step = (now: number) => {
        const k = Math.min(1, (now - started) / ms);
        paint(from + (to - from) * eased(k));
        frameRef.current = k < 1 ? requestAnimationFrame(step) : 0;
      };
      frameRef.current = requestAnimationFrame(step);
    },
    [centre, paint],
  );

  /* A new set of words is a new list: start at the top and land, don't travel. */
  useEffect(() => {
    atRef.current = 0;
    instantRef.current = true;
    const box = boxRef.current;
    if (box) box.scrollTop = 0;
  }, [body]);

  useEffect(() => {
    if (timed && !held) move(active);
  }, [active, timed, held, move]);

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      if (trackRef.current) trackRef.current.style.transform = "";
    },
    [],
  );

  /* Manual reading wins for a while. `scroll` is not listened to, because the
   * auto-scroll fires it too and the two would have to be untimed apart. */
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !timed) return;

    let timer = 0;
    const hold = () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      atRef.current = box.scrollTop;
      holdUntilRef.current = Date.now() + HOLD_MS;
      setHeld(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setHeld(false);
        holdUntilRef.current = 0;
      }, HOLD_MS);
    };

    const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    events.forEach((name) =>
      box.addEventListener(name, hold, { passive: true }),
    );
    return () => {
      events.forEach((name) => box.removeEventListener(name, hold));
      window.clearTimeout(timer);
    };
  }, [timed]);

  if (!timed) {
    return (
      <div className="scrollbar-none mt-2 min-h-0 flex-1 overflow-y-auto pb-2">
        <div className="flex flex-col gap-3.5">
          {body.stanzas.map((stanza, index) => (
            <p
              key={index}
              className={cn(
                "whitespace-pre-line leading-relaxed",
                immersive
                  ? "text-[clamp(1.25rem,3.3vw,3.5rem)] font-semibold tracking-tight text-white/80"
                  : "text-[13px] text-muted",
              )}
            >
              {stanza}
            </p>
          ))}
        </div>
      </div>
    );
  }

  const resume = () => {
    holdUntilRef.current = 0;
    setHeld(false);
    move(active);
  };

  return (
    <div className="relative mt-2 flex min-h-0 flex-1 flex-col">
      <div
        ref={boxRef}
        className="scrollbar-none min-h-0 flex-1 overflow-y-auto pb-2"
        tabIndex={0}
        aria-label="Lyrics"
      >
        <div
          ref={trackRef}
          className={cn(
            "flex flex-col will-change-transform",
            immersive ? "gap-5 py-[35dvh]" : "gap-0.5",
          )}
        >
          {lines.map((line, index) => (
            <button
              key={`${line.start}-${index}`}
              type="button"
              ref={(node) => {
                rowsRef.current[index] = node;
              }}
              aria-current={index === active ? "time" : undefined}
              onClick={() => {
                /* Tapping is a deliberate jump, so it overrides any hold. */
                holdUntilRef.current = 0;
                setHeld(false);
                instantRef.current = true;
                onSeek(line.start);
              }}
              title={formatSeconds(line.start)}
              style={{ opacity: spotlight(index, active) }}
              className={cn(
                "block w-full cursor-pointer rounded-md px-1.5 py-1 text-start leading-relaxed",
                immersive
                  ? "text-[clamp(1.25rem,3.3vw,3.5rem)] font-semibold tracking-tight focus-visible:outline-white"
                  : "text-[13px]",
                "transition-[opacity,color] duration-300 ease-out motion-reduce:transition-none",
                immersive
                  ? index === active
                    ? "text-white"
                    : "text-white/70 hover:text-white"
                  : index === active
                    ? "font-semibold text-foreground"
                    : "text-muted hover:text-foreground",
              )}
            >
              {line.text}
            </button>
          ))}
        </div>
      </div>

      {held && active >= 0 ? (
        <button
          type="button"
          onClick={resume}
          className="absolute inset-x-0 bottom-1 mx-auto w-max rounded-full border border-separator bg-surface-secondary/95 px-3 py-1 text-[11px] font-semibold text-foreground shadow-field backdrop-blur transition-colors hover:text-brand"
        >
          Jump to current line
        </button>
      ) : null}
    </div>
  );
});

/**
 * Lyrics for whatever is playing, in the now playing card.
 *
 * The words come from lrclib through /api/music/lyrics, already parsed into
 * timestamps, and the line being sung is read off the player's own position —
 * so the highlight can never disagree with the audio, and a tap on any line
 * seeks to it through the same `seek` the progress bar uses. Between lines the
 * list glides on frames instead of jumping on state ticks.
 */
export function LyricsPanel({
  song,
  immersive = false,
}: {
  song: Song;
  immersive?: boolean;
}) {
  const { duration, seek } = useMusicPlayer();
  const [fullscreen, setFullscreen] = useState(false);

  /* The cache answers while a result is fresh; state only carries what an
   * in-flight request lands with, so switching seeds needs no reset pass. */
  const [settled, setSettled] = useState<{
    id: string;
    state: LyricsState;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const state = settled?.id === song.id ? settled.state : cachedState(song.id);
  const loading = !state;

  useEffect(() => {
    if (state) return;

    let running = inflight.get(song.id);
    if (!running) {
      running = fetchLyrics(song).then((next) => {
        // An outage stays uncached, so the next look asks again.
        if (next.kind !== "error")
          store.set(song.id, { at: Date.now(), state: next });
        return next;
      });
      inflight.set(song.id, running);
      // The cleanup chain must not become a second, unhandled rejection.
      void running
        .catch(() => undefined)
        .finally(() => inflight.delete(song.id));
    }

    let alive = true;
    running
      .then((next) => {
        if (alive) setSettled({ id: song.id, state: next });
      })
      .catch(() => {
        if (alive) setSettled({ id: song.id, state: { kind: "error" } });
      });
    return () => {
      alive = false;
    };
  }, [state, song, attempt]);

  const result = state?.kind === "ready" ? state.result : null;
  const body = result?.body ?? null;
  const lines = body?.kind === "timed" ? body.lines : null;
  const active = useLyricClock(song.id, lines);

  const onSeek = useCallback(
    (time: number) => {
      // The catalogue's runtime can sit a second off the real stream.
      seek(Math.max(0, Math.min(time, duration || time)));
    },
    [seek, duration],
  );

  const retry = () => {
    store.delete(song.id);
    setSettled(null);
    setAttempt((value) => value + 1);
  };

  const subtitle = loading
    ? "Looking up the words"
    : state?.kind === "none"
      ? "Nothing found for this track"
      : state?.kind === "instrumental"
        ? "No vocals on this one"
        : state?.kind === "error"
          ? "The lyrics service didn’t answer"
          : result?.drift
            ? "Sync comes from a longer version — lines may drift"
            : result?.body.kind === "plain"
              ? "Timing unavailable for this version"
              : `Matched ${result?.matched.artistName || song.artist} · ${formatSeconds(result?.matched.duration || 0)}`;

  const failed = state?.kind === "none" || state?.kind === "error";

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", !immersive && "mt-5")}>
      {!immersive ? (
        <div className="flex flex-none items-center gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Lyrics
            </p>
            <p
              className="truncate pt-0.5 text-[11px] text-faint-foreground"
              title={song.title}
            >
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={retry}
            disabled={loading}
            aria-label="Look up the lyrics again"
            title="Look up the lyrics again"
            className="ms-auto grid size-9 flex-none place-items-center rounded-full border border-separator text-muted transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <Icon name="refresh" className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            aria-label="Open fullscreen lyrics"
            title="Fullscreen lyrics"
            className="grid size-9 flex-none place-items-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Maximize2 size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-3 flex flex-col gap-2.5">
          {[80, 60, 72, 55, 66].map((width, index) => (
            <div
              key={index}
              className={cn(
                "animate-pulse rounded motion-reduce:animate-none",
                immersive ? "h-8 bg-white/10" : "h-3.5 bg-surface-secondary",
              )}
              style={{ width: `${width}%` }}
            />
          ))}
        </div>
      ) : body ? (
        <LyricsRows
          key={song.id}
          body={body}
          active={active}
          onSeek={onSeek}
          immersive={immersive}
        />
      ) : (
        <div
          className={cn(
            "mt-3 flex flex-col items-start gap-2 px-3 py-3",
            immersive
              ? "my-auto text-white"
              : "rounded-lg border border-separator bg-surface",
          )}
        >
          <span
            className={cn(
              "flex items-center gap-2 font-semibold",
              immersive ? "text-xl text-white" : "text-[13px] text-foreground",
            )}
          >
            <Icon
              name={state?.kind === "instrumental" ? "music" : "mic"}
              className={cn(
                "size-4",
                immersive ? "text-white/60" : "text-muted",
              )}
            />
            {state?.kind === "instrumental"
              ? "This one’s instrumental."
              : state?.kind === "error"
                ? "Couldn’t reach the lyrics service."
                : "No lyrics for this one yet."}
          </span>
          {state?.kind === "instrumental" ? null : (
            <>
              <p
                className={cn(
                  "leading-relaxed",
                  immersive
                    ? "text-sm text-white/60"
                    : "text-[11px] text-faint-foreground",
                )}
              >
                {state?.kind === "error"
                  ? "It usually answers in a moment — nothing was cached, so trying again is safe."
                  : "The lyrics database hasn’t got this track. Instrumental and regional releases are often missing."}
              </p>
              {failed ? (
                <button
                  type="button"
                  onClick={retry}
                  className="rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-accent-foreground transition-transform duration-150 hover:scale-[1.02] active:scale-95"
                >
                  Retry
                </button>
              ) : null}
            </>
          )}
        </div>
      )}
      {fullscreen && !immersive ? (
        <FullscreenLyrics song={song} onClose={() => setFullscreen(false)}>
          <LyricsPanel song={song} immersive />
        </FullscreenLyrics>
      ) : null}
    </div>
  );
}
