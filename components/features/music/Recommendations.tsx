"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Icon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/Feedback";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CollectionHero } from "@/components/features/music/CollectionHero";
import { useMusicPlayer } from "@/components/providers/MusicPlayerProvider";
import { useTaste } from "@/components/providers/TasteProvider";
import type { Shelf, ShelfKey } from "@/lib/taste";
import type { Song } from "@/lib/saavn";

/**
 * The shelves the taste engine built from what the listener has been doing.
 *
 * Nothing is asked of the catalogue until this card is nearly on screen, and a
 * tile press records nothing of its own — the player logs the track change,
 * which is why a shelf tile, a search row and a sidebar playlist all feed one
 * model. Until there are picks worth showing the section stays out of the way.
 */

const ROW_TITLES: Record<ShelfKey, string> = {
  mix: "Your mix",
  radio: "Because you played",
  explore: "Exploring",
  repeat: "On repeat",
};

export function Recommendations() {
  const { shelves, building, vector, ensureBuilt, refresh, reset, lastShown } = useTaste();
  const { startQueue } = useMusicPlayer();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);

  /* Each row asks for its own build as it comes into view; nothing runs before that. */
  useEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      ensureBuilt();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) ensureBuilt();
      },
      { rootMargin: "300px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ensureBuilt]);

  const mix = shelves?.mix ?? null;
  const rows = (["radio", "repeat", "explore"] as ShelfKey[])
    .map((key) => shelves?.[key] ?? null)
    .filter((shelf): shelf is Shelf => !!shelf && shelf.picks.length >= (shelf.key === "explore" ? 4 : 3));

  const count = mix?.picks.length ?? 0;
  // Silent until there is something to show: no empty state, no placeholder prose.
  // The wrapper keeps a one-pixel box even when there is nothing to render — an
  // element with no box never intersects, so a hidden shell would never be able
  // to ask for its first build.
  if (!count && !rows.length) {
    return (
      <div ref={cardRef} className="mt-5">
        {building ? (
          <Card id="for-you">
            <CardContent className="p-3 sm:p-4">
              <Skeleton className="h-28 w-full rounded-xl" />
            </CardContent>
          </Card>
        ) : (
          <span aria-hidden className="block h-px w-full" />
        )}
      </div>
    );
  }

  const seeds = vector?.seeds ?? [];
  const cover = mix?.picks[0]?.song.imageLarge ?? mix?.seed?.imageLarge ?? seeds[0]?.song.imageLarge ?? "";

  return (
    <div ref={cardRef} className="mt-5">
      <Card id="for-you">
        <CardHeader
          title="Made for you"
          description="Built from what you play here"
          actions={
            <button
              type="button"
              onClick={refresh}
              disabled={building}
              title="Build these picks again"
              aria-label="Build these picks again"
              className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <Icon name="refresh" className={`size-4${building ? " motion-safe:animate-spin" : ""}`} />
            </button>
          }
        />

        <CardContent className="p-3 sm:p-4">
          {count > 0 && mix ? (
            <CollectionHero
              eyebrow="Made for you"
              title="Your mix"
              meta={`${count} songs · from what you have been playing`}
              image={cover}
              tone="brand"
            >
              <div className="flex items-center gap-2">
                <PlayButton label="Play your mix" solid onPress={() => startQueue(pickSongs(mix), "Your mix", 0)} />
                <PlayButton
                  label="Shuffle your mix"
                  icon="shuffle"
                  onPress={() => {
                    const songs = pickSongs(mix);
                    startQueue(songs, "Your mix", Math.floor(Math.random() * songs.length));
                  }}
                />
              </div>
            </CollectionHero>
          ) : null}

          {count > 0 && mix ? <Row shelf={mix} onPlay={startQueue} first={count > 0} /> : null}
          {rows.map((shelf) => (
            <Row key={`${shelf.key}-${shelf.title}`} shelf={shelf} onPlay={startQueue} />
          ))}

          <div className="mt-4 flex items-center justify-end border-t border-separator pt-3">
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-[11px] font-medium text-muted transition-colors hover:text-foreground"
            >
              Start over
            </button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirming}
        title="Clear what we have learned?"
        description="Your listening history and these picks will start from zero. Liked songs and playlists are untouched."
        confirmLabel="Clear history"
        destructive
        loading={clearing}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setClearing(true);
          void reset().finally(() => {
            setClearing(false);
            setConfirming(false);
          });
        }}
      />
      <span hidden data-shown={lastShown.join(",")} />
    </div>
  );
}

function pickSongs(shelf: Shelf): Song[] {
  return shelf.picks.map((pick) => pick.song);
}

function PlayButton({
  label,
  onPress,
  icon = "play",
  solid = false,
}: {
  label: string;
  onPress: () => void;
  icon?: "play" | "shuffle";
  solid?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      title={label}
      aria-label={label}
      className={
        solid
          ? "grid size-11 place-items-center rounded-full bg-brand text-white transition-transform hover:scale-105 active:scale-95"
          : "grid size-11 place-items-center rounded-full border border-separator text-muted transition-colors hover:border-border-strong hover:text-foreground"
      }
    >
      <Icon name={icon} className="size-4" />
    </button>
  );
}

/** One shelf: square tiles, the second caption line being the reason it is here. */
function Row({
  shelf,
  onPlay,
  first = false,
}: {
  shelf: Shelf;
  onPlay: (list: Song[], label: string, index: number) => void;
  first?: boolean;
}) {
  const songs = pickSongs(shelf);
  const label = shelf.key === "radio" ? shelf.title : ROW_TITLES[shelf.key];
  return (
    <section className={first ? "mt-5" : "mt-6"}>
      <div className="flex items-baseline justify-between gap-3 pb-2.5">
        <h3 className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{label}</h3>
        <span className="flex-none text-[11px] font-medium text-faint-foreground">{songs.length}</span>
      </div>

      <div className="scrollbar-none flex gap-3 overflow-x-auto pb-1">
        {songs.map((song, index) => {
          const pick = shelf.picks[index];
          const reason = pick?.reason ?? "Sounds similar";
          return (
            <button
              key={`${shelf.key}-${song.id}`}
              type="button"
              onClick={() => onPlay(songs, label, index)}
              title={`${song.title} — ${reason}`}
              aria-label={`Play ${song.title}, ${reason}`}
              className="group w-28 flex-none text-start"
            >
              <span className="relative block aspect-square overflow-hidden rounded-lg border border-separator bg-surface-secondary">
                {song.imageLarge || song.image ? (
                  <Image
                    src={song.imageLarge || song.image}
                    alt=""
                    fill
                    sizes="112px"
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                  />
                ) : (
                  <Icon
                    name="music"
                    className="absolute start-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 text-faint-foreground"
                  />
                )}
                <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <span className="absolute bottom-1.5 start-1.5 grid size-7 place-items-center rounded-full bg-brand/90 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Icon name="play" className="size-3" />
                </span>
              </span>
              <span className="mt-1.5 block truncate text-[11px] font-semibold text-foreground">{song.title}</span>
              <span className="block truncate text-[10px] text-muted">{reason}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
