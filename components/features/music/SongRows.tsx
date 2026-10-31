"use client";

import Image from "next/image";
import { Icon } from "@/components/ui/icons";
import { useLibrary } from "@/components/providers/LibraryProvider";
import { useMusicPlayer } from "@/components/providers/MusicPlayerProvider";
import { useGuestLock } from "@/components/providers/GuestLockProvider";
import { useOffline } from "@/components/providers/OfflineProvider";
import { Waveform } from "@/components/features/music/Waveform";
import { cn } from "@/lib/cn";
import type { Song } from "@/lib/saavn";

function formatSeconds(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** The round icon button every row action is built from. */
const ROW_ACTION =
  "grid size-8 flex-none place-items-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground";

/**
 * How much of a song has reached the device so far. The browser reports bytes,
 * so the arc is the only honest reading of a save in progress.
 */
function SaveRing({ value }: { value: number }) {
  const radius = 8;
  const ring = 2 * Math.PI * radius;
  const share = Math.min(1, Math.max(0, value));
  return (
    <svg viewBox="0 0 20 20" className="size-5 -rotate-90" aria-hidden>
      <circle cx="10" cy="10" r={radius} fill="none" strokeWidth="2" className="stroke-separator" />
      <circle
        cx="10"
        cy="10"
        r={radius}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        className="stroke-accent transition-[stroke-dashoffset] duration-150"
        strokeDasharray={ring}
        strokeDashoffset={ring * (1 - share)}
      />
    </svg>
  );
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
 * Puts a copy of the track on this device, or takes it back off. Every list
 * offers it, so it lives beside the rows instead of inside one view.
 */
export function SaveToDevice({ song }: { song: Song }) {
  const { savedIds, progress, save, removeSaved } = useOffline();
  const { requireAuth } = useGuestLock();
  const saved = savedIds.has(song.id);
  const busy = progress[song.id];
  const share = busy && busy.total > 0 ? busy.loaded / busy.total : 0;
  const percent = Math.min(100, Math.round(share * 100));

  return (
    <button
      type="button"
      onClick={() => {
        if (!requireAuth("tab")) return;
        if (saved) void removeSaved(song.id);
        else void save(song);
      }}
      aria-pressed={saved}
      aria-label={
        saved ? `Take ${song.title} off this device` : `Save ${song.title} on this device`
      }
      title={
        busy
          ? busy.total > 0
            ? `Saving… ${percent}%`
            : "Saving…"
          : saved
            ? "On this device"
            : "Save on this device"
      }
      className={cn(ROW_ACTION, (saved || busy) && "text-brand")}
    >
      {busy ? (
        busy.total > 0 ? (
          <SaveRing value={share} />
        ) : (
          <Icon name="loader" className="size-4 motion-safe:animate-spin" />
        )
      ) : (
        <Icon name="download" className="size-4" />
      )}
    </button>
  );
}

/**
 * Shared track row for the Liked and Playlist home tabs.
 *
 * `table` switches on the Spotify presentation — numbered rows whose index
 * becomes a play button on hover, an album column, and the current track
 * marked in the brand colour. Without it the rows stay exactly as the compact
 * lists render them today. Every row action shows without the pointer, so a
 * touch device reaches them the same way a desktop does.
 *
 * `device` marks a list of audio that already lives here — the saved copies
 * and imported files. Those rows have nothing to save again, and liking or
 * filing one would write a row another device cannot resolve, so the account
 * actions step aside for a single "take it off" button.
 */
export function SongRows({
  songs,
  label,
  onRemove,
  table = false,
  device = false,
  album = true,
}: {
  songs: Song[];
  label: string;
  onRemove?: (song: Song) => void;
  table?: boolean;
  device?: boolean;
  /** Keep in step with <SongTableHead album> or the columns drift apart. */
  album?: boolean;
}) {
  const { startQueue, current, playing, togglePlay, visualizerReady, getAnalyser } =
    useMusicPlayer();
  const { isLiked, toggleLike, openPicker } = useLibrary();
  const { exportCopy } = useOffline();

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
        /** Rows of device audio: the copy is already here, so the button hands
         *  it back out as a file instead of saving it again. */
        const actions = device ? (
          <button
            type="button"
            onClick={() => void exportCopy(song.id)}
            aria-label={`Export a copy of ${song.title}`}
            title="Export a copy"
            className={ROW_ACTION}
          >
            <Icon name="download" className="size-4" />
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => toggleLike(song)}
              aria-pressed={isLiked(song)}
              aria-label={
                isLiked(song) ? `Remove ${song.title} from Liked songs` : `Like ${song.title}`
              }
              title={isLiked(song) ? "Liked" : "Like this song"}
              className={ROW_ACTION}
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
              className={ROW_ACTION}
            >
              <Icon name="plus" className="size-4" />
            </button>
            <SaveToDevice song={song} />
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

            {table && album ? (
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
                    title={device ? "Remove from this device" : "Remove from this playlist"}
                    className="grid size-8 flex-none place-items-center rounded-full text-faint-foreground transition-colors hover:bg-surface-secondary hover:text-danger"
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
                    title={device ? "Remove from this device" : "Remove from this playlist"}
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
