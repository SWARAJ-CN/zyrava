"use client";

import { Icon } from "@/components/ui/icons";
import { CollectionHero, OutlineAction, RoundPlay } from "@/components/features/music/CollectionHero";
import { SongRows, SongTableHead } from "@/components/features/music/SongRows";
import { useLibrary } from "@/components/providers/LibraryProvider";
import { useMusicPlayer } from "@/components/providers/MusicPlayerProvider";
import { useOffline } from "@/components/providers/OfflineProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { cn } from "@/lib/cn";
import { formatRuntime } from "@/lib/format";
import type { Song } from "@/lib/saavn";

function totalSeconds(songs: Song[]): number {
  return songs.reduce((sum, song) => sum + (song.duration || 0), 0);
}

/** The private collection tab — Spotify's Liked Songs screen. */
export function LikedView() {
  const { liked } = useLibrary();
  const { startQueue, shuffle, toggleShuffle } = useMusicPlayer();
  const { toast } = useToast();
  const { savedIds, progress, saving, saveAll } = useOffline();

  const playAll = () => {
    if (!liked.length) {
      toast({ title: "Nothing liked yet", description: "Tap the heart on any song." });
      return;
    }
    startQueue(liked, "Liked songs", 0);
  };

  /** Same mix-then-play move the library list uses, so shuffle never dead-ends. */
  const shufflePlay = () => {
    if (!liked.length) {
      toast({ title: "Nothing liked yet", description: "Tap the heart on any song." });
      return;
    }
    const mixed = [...liked];
    for (let i = mixed.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [mixed[i], mixed[j]] = [mixed[j], mixed[i]];
    }
    if (!shuffle) toggleShuffle();
    startQueue(mixed, "Liked songs", 0);
  };

  const length = formatRuntime(totalSeconds(liked));
  const allSaved = liked.length > 0 && liked.every((song) => savedIds.has(song.id));

  /** Songs finished, plus how far the one still coming through has got. */
  const active = saving ? Object.values(progress)[0] : undefined;
  const fraction = active && active.total > 0 ? active.loaded / active.total : 0;
  const percent = saving
    ? Math.min(100, Math.round(((saving.done + fraction) / saving.total) * 100))
    : 0;

  return (
    <section className="mt-8">
      <CollectionHero
        eyebrow="Collection"
        title="Liked songs"
        glyph="heart"
        image={liked[0]?.image}
        meta={`${liked.length} ${liked.length === 1 ? "song" : "songs"}${
          length ? ` · ${length}` : ""
        } · saved to your account`}
      >
        <RoundPlay onClick={playAll} disabled={!liked.length} label="Play all liked songs">
          <Icon name="play" size={18} className="fill-current" />
        </RoundPlay>
        <OutlineAction
          onClick={shufflePlay}
          disabled={!liked.length}
          active={shuffle}
          label="Shuffle liked songs"
        >
          <Icon name="shuffle" className="size-4.5" />
        </OutlineAction>
        <OutlineAction
          onClick={() => void saveAll(liked)}
          disabled={!liked.length || allSaved || saving !== null}
          active={allSaved}
          label={
            allSaved
              ? "Every liked song is on this device"
              : "Keep every liked song on this device"
          }
        >
          <Icon
            name={saving ? "loader" : "download"}
            className={cn("size-4.5", saving && "motion-safe:animate-spin")}
          />
        </OutlineAction>
      </CollectionHero>

      {saving ? (
        <div className="mt-3 rounded-xl border border-separator bg-surface px-3 py-2.5">
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span className="text-muted">
              Saving song {Math.min(saving.done + 1, saving.total)} of {saving.total} on this
              device
            </span>
            <span className="font-semibold tabular-nums text-foreground">{percent}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-secondary">
            <span
              className="block h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-separator bg-surface p-2 sm:p-3">
        {liked.length ? (
          <>
            <SongTableHead />
            <SongRows songs={liked} label="Liked songs" table />
          </>
        ) : (
          <div className="grid place-items-center gap-3 px-6 py-16 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-danger-soft text-danger-soft-foreground">
              <Icon name="heart" className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">No liked songs yet</p>
              <p className="mt-1 text-xs text-muted">
                Tap the heart on any song in the catalogue and it lands here.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
