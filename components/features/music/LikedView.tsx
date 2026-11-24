"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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

function searchText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

/** The private collection tab — Spotify's Liked Songs screen. */
export function LikedView() {
  const { liked } = useLibrary();
  const { startQueue, shuffle, toggleShuffle } = useMusicPlayer();
  const { toast } = useToast();
  const { savedIds, progress, saving, saveAll } = useOffline();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);
  const filtered = useMemo(() => {
    const words = searchText(query).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return liked;
    return liked.filter((song) => {
      const text = searchText(`${song.title} ${song.artist} ${song.album}`);
      return words.every((word) => text.includes(word));
    });
  }, [liked, query]);
  const updateQuery = (value: string) => {
    setQuery(value);
    listRef.current?.scrollTo({ top: 0, behavior: "instant" });
  };

  const playAll = () => {
    if (!filtered.length) {
      toast({ title: "Nothing liked yet", description: "Tap the heart on any song." });
      return;
    }
    startQueue(filtered, "Liked songs", 0);
  };

  /** Same mix-then-play move the library list uses, so shuffle never dead-ends. */
  const shufflePlay = () => {
    if (!filtered.length) {
      toast({ title: "Nothing liked yet", description: "Tap the heart on any song." });
      return;
    }
    const mixed = [...filtered];
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
        <RoundPlay onClick={playAll} disabled={!filtered.length} label={query.trim() ? "Play matching liked songs" : "Play all liked songs"}>
          <Icon name="play" size={18} className="fill-current" />
        </RoundPlay>
        <OutlineAction
          onClick={shufflePlay}
          disabled={!filtered.length}
          active={shuffle}
          label={query.trim() ? "Shuffle matching liked songs" : "Shuffle liked songs"}
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
        <button
          type="button"
          aria-label="Search liked songs"
          title="Search liked songs"
          aria-expanded={searchOpen}
          aria-controls={searchOpen ? searchId : undefined}
          onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) updateQuery(""); }}
          className={cn("grid size-12 place-items-center rounded-full border border-separator transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent", searchOpen ? "bg-accent-soft text-brand" : "text-muted")}
        ><Icon name="search" className="size-4.5" /></button>
        {searchOpen ? <div className="flex h-11 min-w-0 basis-full items-center gap-2 rounded-full border border-separator bg-background/40 ps-3 pe-1 text-muted transition-colors focus-within:border-brand sm:basis-56">
          <Icon name="search" className="size-4 shrink-0" aria-hidden />
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                updateQuery("");
              }
            }}
            aria-label="Search liked songs"
            placeholder="Find a liked song…"
            className="min-w-0 flex-1 bg-transparent py-2 text-base text-foreground outline-none focus-visible:outline-none! placeholder:text-muted sm:text-sm [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query ? <button
            type="button"
            aria-label="Clear liked songs search"
            onClick={() => { updateQuery(""); searchRef.current?.focus(); }}
            className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-surface-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
          ><Icon name="x" className="size-3.5" /></button> : null}
        </div> : null}
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
        {query.trim() ? <p role="status" className="px-2 pb-3 pt-1 text-xs text-muted">{filtered.length} of {liked.length} liked songs</p> : null}
        {liked.length ? (
          <>
            <SongTableHead />
            <div
              ref={listRef}
              role="region"
              aria-label="Liked songs list"
              tabIndex={0}
              className="scrollbar-none max-h-[min(60dvh,36rem)] overflow-y-auto overscroll-y-contain rounded-lg focus-visible:outline-2 focus-visible:outline-accent"
            >
              {filtered.length ? <SongRows songs={filtered} label="Liked songs" table /> : (
                <div className="px-4 py-12 text-center">
                  <p className="text-sm font-semibold text-foreground">No matching liked songs</p>
                  <p className="mt-1 text-xs text-muted">Try another song, artist, or album.</p>
                  <button type="button" onClick={() => { updateQuery(""); searchRef.current?.focus(); }} className="mt-3 rounded-full px-3 py-2 text-xs font-semibold text-brand hover:bg-accent-soft">Clear search</button>
                </div>
              )}
            </div>
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
