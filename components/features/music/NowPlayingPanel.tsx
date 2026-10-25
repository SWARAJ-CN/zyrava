"use client";

import Image from "next/image";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icons";
import { useMusicPlayer } from "@/components/providers/MusicPlayerProvider";
import { RelatedSongs } from "@/components/features/music/RelatedSongs";

/**
 * The Spotify-style "Now playing" preview — a fixed glass card docked to the
 * right edge on wide screens, above the player bar. Big artwork, the full
 * song card and quick playback, mirroring the desktop client's side panel.
 */
export function NowPlayingPanel() {
  const {
    queue,
    index,
    current,
    playing,
    queueLabel,
    nowPlayingOpen,
    setNowPlayingOpen,
    togglePlay,
    progress,
    duration,
  } = useMusicPlayer();

  if (!nowPlayingOpen || !current) return null;

  return (
    <aside
      aria-label="Now playing"
      className="fixed end-4 top-4 bottom-[8.25rem] z-30 hidden w-[21.75rem] flex-none flex-col overflow-hidden rounded-xl border border-separator bg-surface-secondary/85 shadow-pop backdrop-blur-xl xl:flex"
    >
      {/* Header — Spotify's light top row */}
      <div className="flex items-center justify-between gap-2 px-5 pb-3 pt-4">
        <p className="truncate text-sm font-bold text-foreground">{queueLabel || "Now playing"}</p>
        <button
          type="button"
          onClick={() => setNowPlayingOpen(false)}
          aria-label="Close now playing panel"
          title="Hide panel"
          className="grid size-8 flex-none place-items-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
        >
          <Icon name="x" className="size-4" />
        </button>
      </div>

      {/* Artwork card with the play overlay */}
      <div className="px-5">
        <div className="group relative aspect-square w-full overflow-hidden rounded-lg border border-separator bg-surface-muted">
          {current.image ? (
            <Image
              src={current.imageLarge || current.image}
              alt=""
              fill
              sizes="(min-width:1280px) 340px, 0px"
              className="object-cover"
            />
          ) : (
            <span className="grid h-full place-items-center text-faint-foreground">
              <Icon name="music" className="size-10" />
            </span>
          )}
          {playing ? (
            <span className="absolute start-3 top-3 eq text-white drop-shadow">
              <span />
              <span />
              <span />
            </span>
          ) : null}
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className={cn(
              "absolute inset-0 grid place-items-center bg-black/40 transition-opacity duration-200",
              playing ? "opacity-0 group-hover:opacity-100" : "opacity-100"
            )}
          >
            <span className="grid size-12 place-items-center rounded-full bg-white text-black shadow-field transition-transform hover:scale-105">
              <Icon name={playing ? "pause" : "play"} size={22} className="fill-black text-black" />
            </span>
          </button>
        </div>
      </div>

      {/* Song card — title, artist, album, position */}
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-4 pt-4">
        <h2 className="truncate text-2xl font-black tracking-tight text-foreground" title={current.title}>
          {current.title}
        </h2>
        <p className="mt-1 truncate text-sm font-medium text-muted" title={current.artist}>
          {current.artist}
        </p>
        <p className="mt-0.5 truncate text-xs text-faint-foreground" title={current.album}>
          {current.album}
          {current.year ? ` · ${current.year}` : ""}
        </p>

        <div className="mt-4 flex items-center gap-2">
          <span className="rounded-full border border-separator px-2.5 py-1 text-[11px] font-semibold text-muted">
            {index + 1} of {queue.length}
          </span>
          <span className="text-[11px] tabular-nums text-faint-foreground">
            {playing ? `${Math.floor(progress)}s elapsed` : "Paused"}
          </span>
        </div>

        {/* Slim progress read */}
        <div className="mt-2.5">
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-secondary">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-200"
              style={{ width: `${duration ? Math.min(100, (progress / duration) * 100) : 0}%` }}
            />
          </div>
        </div>

        {/* Catalogue radio for whatever is playing — Spotify's side list. */}
        <RelatedSongs song={current} />

        {/* Quick actions pinned at the bottom, Spotify style */}
        <div className="mt-auto flex items-center gap-2 border-t border-separator pt-3">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className={cn(
              "grid size-10 place-items-center rounded-full bg-accent text-accent-foreground transition-transform duration-150 hover:scale-105 active:scale-95",
              !playing && ""
            )}
          >
            <Icon name={playing ? "pause" : "play"} size={18} className="fill-current" />
          </button>
          {current.pageUrl ? (
            <a
              href={current.pageUrl}
              target="_blank"
              rel="noreferrer"
              title="Open song page"
              aria-label="Open song page"
              className="grid size-10 place-items-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
            >
              <Icon name="external-link" className="size-4.5" />
            </a>
          ) : null}
          <span className="ms-auto truncate text-[11px] font-medium text-faint-foreground">
            ZYRAVA
          </span>
        </div>
      </div>
    </aside>
  );
}
