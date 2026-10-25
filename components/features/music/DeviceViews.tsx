"use client";

import { useMemo, type ReactNode } from "react";
import { Icon } from "@/components/ui/icons";
import {
  CollectionHero,
  OutlineAction,
  RoundPlay,
} from "@/components/features/music/CollectionHero";
import { SongRows, SongTableHead } from "@/components/features/music/SongRows";
import { useMusicPlayer } from "@/components/providers/MusicPlayerProvider";
import { useOffline } from "@/components/providers/OfflineProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { formatBytes, formatRuntime } from "@/lib/format";
import { toSong, type OfflineTrack } from "@/lib/offline";

/** Play, shuffle and the running totals every device-held list reports. */
function useDevicePlayback(tracks: OfflineTrack[], label: string) {
  const songs = useMemo(() => tracks.map(toSong), [tracks]);
  const { startQueue, shuffle, toggleShuffle } = useMusicPlayer();
  const { toast } = useToast();

  const empty = {
    title: "Nothing to play yet",
    description: `${label} has no songs in it.`,
  };

  const playAll = () => {
    if (!songs.length) {
      toast(empty);
      return;
    }
    startQueue(songs, label, 0);
  };

  /** Mix a copy first, so turning shuffle on never dead-ends. */
  const shufflePlay = () => {
    if (!songs.length) {
      toast(empty);
      return;
    }
    const mixed = [...songs];
    for (let i = mixed.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [mixed[i], mixed[j]] = [mixed[j], mixed[i]];
    }
    if (!shuffle) toggleShuffle();
    startQueue(mixed, label, 0);
  };

  const runtime = formatRuntime(songs.reduce((sum, song) => sum + (song.duration || 0), 0));
  const bytes = formatBytes(tracks.reduce((sum, track) => sum + track.bytes, 0));
  const count = `${tracks.length} ${tracks.length === 1 ? "song" : "songs"}`;

  return { songs, playAll, shufflePlay, shuffle, runtime, bytes, count };
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-separator bg-surface p-2 sm:p-3">{children}</div>
  );
}

function EmptyPanel({
  glyph,
  headline,
  body,
  action,
}: {
  glyph: "download" | "music";
  headline: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Panel>
      <div className="grid place-items-center gap-3 px-6 py-16 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-surface-secondary text-muted">
          <Icon name={glyph} className="size-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">{headline}</p>
          <p className="mt-1 text-xs text-muted">{body}</p>
        </div>
        {action}
      </div>
    </Panel>
  );
}

/** Catalogue songs kept here, playable with no connection. */
export function DownloadsView() {
  const { downloads, removeSaved } = useOffline();
  const { songs, playAll, shufflePlay, shuffle, runtime, bytes, count } = useDevicePlayback(
    downloads,
    "Downloads"
  );

  return (
    <section className="mt-8">
      <CollectionHero
        eyebrow="On this device"
        title="Downloads"
        glyph="download"
        image={downloads[0]?.image}
        meta={`${count}${runtime ? ` · ${runtime}` : ""} · ${bytes} kept in this browser`}
      >
        <RoundPlay onClick={playAll} disabled={!songs.length} label="Play every saved song">
          <Icon name="play" size={18} className="fill-current" />
        </RoundPlay>
        <OutlineAction
          onClick={shufflePlay}
          disabled={!songs.length}
          active={shuffle}
          label="Shuffle saved songs"
        >
          <Icon name="shuffle" className="size-4.5" />
        </OutlineAction>
      </CollectionHero>

      {songs.length ? (
        <Panel>
          <SongTableHead />
          <SongRows
            songs={songs}
            label="Downloads"
            table
            device
            onRemove={(song) => void removeSaved(song.id)}
          />
        </Panel>
      ) : (
        <EmptyPanel
          glyph="download"
          headline="No songs saved here yet"
          body="Press the save button on any song and it stays on this device — playable when there is no network at all."
        />
      )}
    </section>
  );
}

/** Audio the user brought in themselves, held on this device. */
export function OfflineView({ onImport }: { onImport: () => void }) {
  const { locals, removeLocal } = useOffline();
  const { songs, playAll, shufflePlay, shuffle, runtime, bytes, count } = useDevicePlayback(
    locals,
    "Offline"
  );

  return (
    <section className="mt-8">
      <CollectionHero
        eyebrow="Your files"
        title="Offline playing"
        glyph="music"
        meta={`${count}${runtime ? ` · ${runtime}` : ""} · ${bytes} from your own folder`}
      >
        <RoundPlay onClick={playAll} disabled={!songs.length} label="Play every one of your songs">
          <Icon name="play" size={18} className="fill-current" />
        </RoundPlay>
        <OutlineAction
          onClick={shufflePlay}
          disabled={!songs.length}
          active={shuffle}
          label="Shuffle your songs"
        >
          <Icon name="shuffle" className="size-4.5" />
        </OutlineAction>
        <OutlineAction onClick={onImport} label="Add songs from this device">
          <Icon name="plus" className="size-5" />
        </OutlineAction>
      </CollectionHero>

      {songs.length ? (
        <Panel>
          <SongTableHead album={false} />
          <SongRows
            songs={songs}
            label="Offline playing"
            table
            device
            album={false}
            onRemove={(song) => void removeLocal(song.id)}
          />
        </Panel>
      ) : (
        <EmptyPanel
          glyph="music"
          headline="No songs from your folder yet"
          body="Point the app at a folder of audio files and they appear here, ready to play with the screen off or the connection gone."
          action={
            <button
              type="button"
              onClick={onImport}
              className="mt-1 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-transform hover:scale-[1.02] active:scale-95"
            >
              <Icon name="plus" className="size-4" />
              Add your songs
            </button>
          }
        />
      )}
    </section>
  );
}
