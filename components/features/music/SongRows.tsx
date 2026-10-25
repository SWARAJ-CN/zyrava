"use client";

import Image from "next/image";
import { Icon } from "@/components/ui/icons";
import { useLibrary } from "@/components/providers/LibraryProvider";
import { useMusicPlayer } from "@/components/providers/MusicPlayerProvider";
import { Waveform } from "@/components/features/music/Waveform";
import { cn } from "@/lib/cn";
import type { Song } from "@/lib/saavn";

function formatSeconds(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Column captions for the table variant — sits directly above <SongRows table>. */
export function SongTableHead({ album = true }: { album?: boolean }) {
  return (
    <div className="flex items-center gap-3 border-b border-separator px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">
      <span className="w-6 flex-none text-center">#</span>
      <span className="min-w-0 flex-1">Title</span>
      {album ? <span className="hidden min-w-0 flex-1 lg:block">Album</span> : null}
      <span className="w-[7rem] flex-none text-end">
        <Icon name="clock" className="inline-block size-3.5" />
        <span className="sr-only">Duration</span>
      </span>
    </div>
  );
}

/**
 * Shared track row for the Liked and Playlist home tabs.
 *
 * `table` switches on the Spotify presentation — numbered rows whose index
 * becomes a play button on hover, an album column, actions that only appear
 * with the pointer and the current track marked in the brand colour. Without
 * it the rows stay exactly as the compact lists render them today.
 */
export function SongRows({
  songs,
  label,
  onRemove,
  table = false,
}: {
  songs: Song[];
  label: string;
  onRemove?: (song: Song) => void;
  table?: boolean;
}) {
  const { startQueue, current, playing, togglePlay, visualizerReady, getAnalyser } =
    useMusicPlayer();
  const { isLiked, toggleLike, openPicker } = useLibrary();

  /** Live bars, with the CSS mimic when CORS keeps the analyser away. */
  const renderWave = (className: string, tone: string) => (
    <span className={cn("grid place-items-center", className)}>
      {visualizerReady ? (
        <Waveform
          getAnalyser={getAnalyser}
          active={playing}
          className={cn("h-full w-full", tone)}
        />
      ) : (
        <span className={cn("eq", tone)}>
          <span />
          <span />
          <span />
        </span>
      )}
    </span>
  );

  return (
    <div className={cn("flex flex-col", table ? "gap-0.5 pt-1" : "gap-0.5")}>
      {songs.map((song, index) => {
        const active = current?.id === song.id;
        const actions = (
          <>
            <button
              type="button"
              onClick={() => toggleLike(song)}
              aria-pressed={isLiked(song)}
              aria-label={
                isLiked(song) ? `Remove ${song.title} from Liked songs` : `Like ${song.title}`
              }
              title={isLiked(song) ? "Liked" : "Like this song"}
              className={cn(
                "grid size-8 flex-none place-items-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground",
                table && "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                isLiked(song) && !table && "opacity-100"
              )}
            >
              <Icon
                name="heart"
                className={cn("size-4", isLiked(song) && "fill-danger text-danger")}
              />
            </button>
            <button
              type="button"
              onClick={() => openPicker(song)}
              aria-label={`Add ${song.title} to a playlist`}
              title="Add to playlist"
              className={cn(
                "grid size-8 flex-none place-items-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground",
                table && "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              )}
            >
              <Icon name="plus" className="size-4" />
            </button>
          </>
        );

        return (
          <div
            key={song.id}
            className={cn(
              "group flex items-center transition-colors hover:bg-surface-secondary",
              table ? "gap-3 rounded-lg px-2 py-1.5" : "gap-1 rounded-lg px-2 py-1.5",
              table && active && "bg-accent-soft"
            )}
          >
            {table ? (
              <span className="grid w-6 flex-none place-items-center">
                {active && playing ? (
                  <>
                    <span className="h-4 w-4 group-hover:hidden">
                      {renderWave("h-full w-full", "text-brand")}
                    </span>
                    <button
                      type="button"
                      onClick={togglePlay}
                      aria-label={`Pause ${song.title}`}
                      className="hidden place-items-center text-brand group-hover:grid"
                    >
                      <Icon name="pause" className="size-3.5 fill-current" />
                    </button>
                  </>
                ) : (
                  <>
                    <span
                      className={cn(
                        "text-xs tabular-nums group-hover:hidden",
                        active ? "text-brand" : "text-muted"
                      )}
                    >
                      {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => (active ? togglePlay() : startQueue(songs, label, index))}
                      aria-label={active ? `Resume ${song.title}` : `Play ${song.title}`}
                      className="hidden place-items-center text-foreground group-hover:grid"
                    >
                      <Icon name="play" className="size-3.5 fill-current" />
                    </button>
                  </>
                )}
              </span>
            ) : null}

            <button
              type="button"
              onClick={() => startQueue(songs, label, index)}
              aria-label={`Play ${song.title} by ${song.artist}`}
              className="flex min-w-0 flex-1 items-center gap-3 text-start"
            >
              <span className="relative size-11 flex-none overflow-hidden rounded-lg bg-surface-muted">
                {song.image ? (
                  <Image
                    src={song.image}
                    alt=""
                    width={88}
                    height={88}
                    sizes="44px"
                    className="size-full object-cover"
                  />
                ) : (
                  <Icon name="music" className="m-auto size-4 text-faint-foreground" />
                )}
                {!table ? (
                  <span className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                    <Icon name="play" className="size-3.5 fill-white text-white" />
                  </span>
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-sm font-semibold",
                    active ? "text-brand" : "text-foreground"
                  )}
                >
                  {song.title}
                </span>
                <span className="block truncate text-[11px] text-muted">{song.artist}</span>
              </span>
            </button>

            {table ? (
              <span className="hidden min-w-0 flex-1 truncate text-[11px] text-muted lg:block">
                {song.album || "—"}
              </span>
            ) : null}

            <span
              className={cn(
                "flex-none text-[11px] tabular-nums text-muted",
                table ? "block" : "hidden sm:block"
              )}
            >
              {formatSeconds(song.duration)}
            </span>

            {table ? (
              <span className="flex flex-none items-center gap-1">
                {actions}
                {onRemove ? (
                  <button
                    type="button"
                    onClick={() => onRemove(song)}
                    aria-label={`Remove ${song.title}`}
                    title="Remove from this playlist"
                    className="grid size-8 flex-none place-items-center rounded-full text-faint-foreground opacity-0 transition-colors hover:bg-surface-secondary hover:text-danger group-hover:opacity-100"
                  >
                    <Icon name="trash" className="size-4" />
                  </button>
                ) : null}
              </span>
            ) : (
              <>
                {actions}
                {onRemove ? (
                  <button
                    type="button"
                    onClick={() => onRemove(song)}
                    aria-label={`Remove ${song.title}`}
                    title="Remove from this playlist"
                    className="grid size-8 flex-none place-items-center rounded-full text-faint-foreground transition-colors hover:bg-surface-secondary hover:text-danger"
                  >
                    <Icon name="x" className="size-4" />
                  </button>
                ) : null}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
