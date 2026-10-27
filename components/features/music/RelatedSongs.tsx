"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useLibrary } from "@/components/providers/LibraryProvider";
import { useMusicPlayer } from "@/components/providers/MusicPlayerProvider";
import { tasteProfile, type RelatedPick } from "@/lib/related";
import { buildRadioFor, type FetchPool } from "@/lib/taste";
import type { Song } from "@/lib/saavn";

const PICKS = 10;
/** A track's radio run is reused for a while — no refetch on panel reopen. */
const TTL = 10 * 60 * 1000;

const store = new Map<string, { at: number; picks: RelatedPick[] }>();

/** A run only stands for a while — after the TTL the seed is searched again. */
function cachedRun(id: string): RelatedPick[] | undefined {
  const entry = store.get(id);
  return entry && Date.now() - entry.at < TTL ? entry.picks : undefined;
}

function formatSeconds(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

interface PagePayload {
  songs?: Song[];
}

/** Live request for one seed id — a reopen during the fetch reuses it. */
const inflight = new Map<string, Promise<RelatedPick[]>>();

/** One catalogue round trip, in the shape the engine asks for. */
const searchPool: FetchPool = async (phrase, limit) => {
  const response = await fetch(
    `/api/music/search?q=${encodeURIComponent(phrase)}&limit=${limit}`,
    { cache: "no-store" }
  );
  if (!response.ok) return [];
  const data = (await response.json()) as PagePayload;
  return data.songs ?? [];
};

/** The same radio the home shelves build — one algorithm, two surfaces. */
async function fetchRelated(song: Song, taste: Set<string>): Promise<RelatedPick[]> {
  return buildRadioFor(song, taste, searchPool, PICKS);
}

/**
 * "Related songs" inside the now playing card.
 *
 * The seed track is broken into search angles (its artists, album, title
 * words, language + mood), the catalogue is asked through the existing search
 * route, and the pooled answers are ranked by /lib/related — multi-seed
 * evidence, weighted content similarity, the listener's own taste, then an MMR
 * pass so the run stays varied.
 */
export function RelatedSongs({ song }: { song: Song }) {
  const { startQueue } = useMusicPlayer();
  const { liked, playlists, toggleLike } = useLibrary();

  /* The cache answers while a run is fresh; state only carries what an
   * in-flight request lands with, so switching seeds never needs a reset
   * pass through the effect. */
  const [settled, setSettled] = useState<{ id: string; picks: RelatedPick[] } | null>(null);
  const picks = settled?.id === song.id ? settled.picks : cachedRun(song.id);
  const loading = !picks;

  useEffect(() => {
    if (picks) return;

    let running = inflight.get(song.id);
    if (!running) {
      const taste = tasteProfile([
        ...liked,
        ...playlists.flatMap((playlist) => playlist.songs),
      ]);
      running = fetchRelated(song, taste).then((ranked) => {
        // Empty stays uncached, so a hiccup on one search is retried later.
        if (ranked.length) store.set(song.id, { at: Date.now(), picks: ranked });
        return ranked;
      });
      inflight.set(song.id, running);
      // The cleanup chain must not become a second, unhandled rejection.
      void running
        .catch(() => undefined)
        .finally(() => inflight.delete(song.id));
    }

    let alive = true;
    running
      .then((ranked) => {
        if (alive) setSettled({ id: song.id, picks: ranked });
      })
      .catch(() => {
        if (alive) setSettled({ id: song.id, picks: [] });
      });
    return () => {
      alive = false;
    };
  }, [picks, song, liked, playlists]);

  if (!loading && !picks?.length) return null;

  const shown = picks ?? [];
  const songs = shown.map((pick) => pick.song);
  const label = `Radio · ${song.title}`;

  return (
    <div className="mt-5 flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Related songs
          </p>
          <p className="truncate pt-0.5 text-[11px] text-faint-foreground" title={song.title}>
            Because you&apos;re playing {song.title}
          </p>
        </div>
        <button
          type="button"
          onClick={() => startQueue(songs, label, 0)}
          disabled={!shown.length}
          aria-label="Play related songs"
          title="Play related songs"
          className="ms-auto grid size-9 flex-none place-items-center rounded-full bg-accent text-accent-foreground shadow-field transition-transform duration-150 hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
        >
          <Icon name="play" size={15} className="fill-current" />
        </button>
      </div>

      <div className="scrollbar-none mt-2 min-h-0 flex-1 overflow-y-auto pb-1">
        {loading ? (
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex animate-pulse items-center gap-2.5 px-1 py-1.5">
                <div className="size-10 flex-none rounded-md bg-surface-secondary" />
                <div className="min-w-0 flex-1">
                  <div className="h-3 w-3/4 rounded bg-surface-secondary" />
                  <div className="mt-1.5 h-2.5 w-1/2 rounded bg-surface-secondary" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {shown.map((pick, index) => (
              <div
                key={pick.song.id}
                className="group flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-surface-secondary"
              >
                <button
                  type="button"
                  onClick={() => startQueue(songs, label, index)}
                  aria-label={`Play ${pick.song.title} by ${pick.song.artist}`}
                  title={`${pick.reason} · ${pick.song.artist}`}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-start"
                >
                  <span className="relative size-10 flex-none overflow-hidden rounded-md bg-surface-muted">
                    {pick.song.image ? (
                      <Image
                        src={pick.song.image}
                        alt=""
                        width={80}
                        height={80}
                        sizes="40px"
                        className="size-full object-cover"
                      />
                    ) : (
                      <Icon name="music" className="m-auto size-4 text-faint-foreground" />
                    )}
                    <span className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                      <Icon name="play" className="size-3 fill-white text-white" />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-foreground">
                      {pick.song.title}
                    </span>
                    <span className="block truncate text-[11px] text-muted">{pick.song.artist}</span>
                  </span>
                </button>
                <span className="flex-none text-[11px] tabular-nums text-faint-foreground">
                  {formatSeconds(pick.song.duration)}
                </span>
                <button
                  type="button"
                  onClick={() => toggleLike(pick.song)}
                  aria-pressed={liked.some((entry) => entry.id === pick.song.id)}
                  aria-label={
                    liked.some((entry) => entry.id === pick.song.id)
                      ? `Remove ${pick.song.title} from Liked songs`
                      : `Like ${pick.song.title}`
                  }
                  title={liked.some((entry) => entry.id === pick.song.id) ? "Liked" : "Like this song"}
                  className="grid size-7 flex-none shrink-0 cursor-pointer place-items-center rounded-full transition-opacity opacity-0 md:opacity-100 hover:opacity-100 focus-visible:opacity-100"
                >
                  <Icon
                    name="heart"
                    className={cn(
                      "size-4 text-muted transition-colors hover:text-danger",
                      liked.some((entry) => entry.id === pick.song.id) && "fill-danger text-danger"
                    )}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
