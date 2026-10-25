"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { ClickButton } from "@/components/ui/ClickButton";
import { SongRows, SongTableHead } from "@/components/features/music/SongRows";
import { CollectionHero, RoundPlay } from "@/components/features/music/CollectionHero";
import { formatRuntime } from "@/lib/format";
import { useLibrary } from "@/components/providers/LibraryProvider";
import { useMusicPlayer } from "@/components/providers/MusicPlayerProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { cn } from "@/lib/cn";
import type { Song } from "@/lib/saavn";

interface ApiPlaylist {
  id: string;
  title: string;
  image: string;
  songCount: number;
  language: string;
}

interface DetailState {
  title: string;
  image: string;
  songs: Song[];
  songCount: number;
  playlistId?: string;
}

export function PlaylistsView({ query }: { query: string }) {
  const { playlists, createPlaylist, deletePlaylist, removeFromPlaylist } = useLibrary();
  const { startQueue } = useMusicPlayer();
  const { toast } = useToast();

  const [apiLists, setApiLists] = useState<ApiPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const frame = requestAnimationFrame(() => {
      setLoading(true);
      setError(null);
      setDetail(null);
    });

    fetch(`/api/music/playlists?q=${encodeURIComponent(query)}&limit=8`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as
          | { playlists?: ApiPlaylist[]; error?: string }
          | null;
        if (!response.ok) throw new Error(data?.error ?? "Could not load playlists.");
        return data;
      })
      .then((data) => {
        if (alive) setApiLists(Array.isArray(data?.playlists) ? data.playlists : []);
      })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : "Could not load playlists.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, [query]);

  const openApiPlaylist = async (playlist: ApiPlaylist) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const response = await fetch(`/api/music/playlists/${playlist.id}`, { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as
        | {
            playlist?: {
              title: string;
              image: string;
              songCount?: number;
              songs?: Song[];
            };
            error?: string;
          }
        | null;
      if (!response.ok || !data?.playlist) {
        throw new Error(data?.error ?? "Could not open that playlist.");
      }
      setDetail({
        title: data.playlist.title,
        image: data.playlist.image,
        songs: data.playlist.songs ?? [],
        songCount: data.playlist.songCount ?? data.playlist.songs?.length ?? 0,
      });
    } catch (cause) {
      toast({
        title: cause instanceof Error ? cause.message : "Could not open that playlist.",
        variant: "error",
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const openMine = (id: string) => {
    const playlist = playlists.find((entry) => entry.id === id);
    if (!playlist) return;
    setDetail({
      title: playlist.name,
      image: playlist.songs[0]?.image ?? "",
      songs: playlist.songs,
      songCount: playlist.songs.length,
      playlistId: playlist.id,
    });
  };

  const removeSong = (song: Song) => {
    if (!detail?.playlistId) return;
    removeFromPlaylist(detail.playlistId, song.id);
    setDetail((current) =>
      current
        ? {
            ...current,
            songs: current.songs.filter((entry) => entry.id !== song.id),
            songCount: Math.max(0, current.songCount - 1),
          }
        : current
    );
    toast({ title: "Removed from playlist", description: song.title });
  };

  const submitNew = () => {
    const id = createPlaylist(newName);
    if (!id) {
      setCreateError("That name is empty or already used.");
      return;
    }
    setNewName("");
    setCreateError(null);
    setCreating(false);
  };

  const detailRuntime = detail
    ? formatRuntime(detail.songs.reduce((sum, song) => sum + (song.duration || 0), 0))
    : "";

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
            Playlists
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Your mixes & the catalogue
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Catalogue playlists for <span className="font-medium text-foreground">“{query}”</span>
            , plus every playlist you have built here.
          </p>
        </div>
        <ClickButton
          square
          onClick={() => {
            setCreating((value) => !value);
            setCreateError(null);
          }}
          className="h-10 gap-2 px-4 text-[12px] font-semibold"
        >
          <Icon name="plus" className="size-3.5" />
          New playlist
        </ClickButton>
      </div>

      {creating ? (
        <div className="mt-4 rounded-xl border border-separator bg-surface p-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              Playlist name
            </span>
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(event) => {
                  setNewName(event.target.value);
                  setCreateError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitNew();
                }}
                maxLength={40}
                placeholder="Late-night drive"
                className="compact-select h-10 min-w-0 flex-1 rounded-lg border border-separator bg-surface-secondary/50 px-3 text-foreground placeholder:text-faint-foreground"
              />
              <ClickButton square onClick={submitNew} className="h-10 px-4 text-[12px] font-semibold">
                Create
              </ClickButton>
            </div>
            {createError ? (
              <span className="text-[11px] text-danger-soft-foreground">{createError}</span>
            ) : null}
          </label>
        </div>
      ) : null}

      {playlists.length ? (
        <div className="mt-6">
          <h3 className="pb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Your playlists
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {playlists.map((playlist) => (
              <div key={playlist.id} className="group relative">
                <button
                  type="button"
                  onClick={() => openMine(playlist.id)}
                  className="block w-full text-start"
                >
                  <span className="relative block aspect-square overflow-hidden rounded-xl border border-separator bg-[radial-gradient(120%_100%_at_30%_0%,var(--surface-secondary),var(--background))]">
                    {playlist.songs[0]?.image ? (
                      <Image
                        src={playlist.songs[0].image}
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 20vw, 40vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <Icon
                        name="list"
                        className="absolute start-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 text-faint-foreground"
                      />
                    )}
                    <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    <span className="absolute bottom-2 start-2 text-[10px] font-semibold uppercase tracking-wider text-white/75">
                      {playlist.songs.length} {playlist.songs.length === 1 ? "track" : "tracks"}
                    </span>
                    {/* Spotify's card play button — rests under the tile, lifts
                        on hover and queues the list without opening it. */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute bottom-2 end-2 grid size-10 translate-y-2 place-items-center rounded-full bg-accent text-accent-foreground opacity-0 shadow-pop transition-[opacity,transform] duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
                    >
                      <Icon name="play" size={15} className="fill-current" />
                    </span>
                  </span>
                  <span className="mt-2 block truncate text-sm font-semibold text-foreground">
                    {playlist.name}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deletePlaylist(playlist.id);
                    if (detail?.playlistId === playlist.id) setDetail(null);
                  }}
                  aria-label={`Delete playlist ${playlist.name}`}
                  title="Delete playlist"
                  className="absolute end-2 top-2 grid size-8 place-items-center rounded-full bg-black/50 text-white/80 backdrop-blur transition-colors hover:bg-black/70 hover:text-white"
                >
                  <Icon name="trash" className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-6 rounded-xl border border-dashed border-separator px-4 py-6 text-center text-xs text-muted">
          No playlists yet. Create one above, then add songs with the + on any track.
        </p>
      )}

      <div className="mt-9">
        <div className="flex items-baseline justify-between gap-3 pb-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            From the catalogue
          </h3>
          <span className="truncate text-[10px] text-faint-foreground">“{query}”</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="animate-pulse">
                <div className="aspect-square rounded-xl bg-surface-secondary" />
                <div className="mt-2 h-3 w-3/4 rounded bg-surface-secondary" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-xs text-warning-soft-foreground">
            {error} Try another search.
          </div>
        ) : apiLists.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {apiLists.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                onClick={() => openApiPlaylist(playlist)}
                className="group text-start"
                aria-label={`Open playlist ${playlist.title}`}
              >
                <span className="relative block aspect-square overflow-hidden rounded-xl border border-separator bg-surface-secondary">
                  {playlist.image ? (
                    <Image
                      src={playlist.image}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 20vw, 40vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <Icon
                      name="music"
                      className="absolute start-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 text-faint-foreground"
                    />
                  )}
                  <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  <span className="absolute bottom-2 start-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/80">
                    <Icon name="list" className="size-3" />
                    {playlist.songCount} tracks
                  </span>
                </span>
                <span className="mt-2 block truncate text-sm font-semibold text-foreground">
                  {playlist.title}
                </span>
                <span className="block truncate text-[11px] capitalize text-muted">
                  {playlist.language || "playlist"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-separator px-4 py-8 text-center text-xs text-muted">
            No catalogue playlists for this search.
          </p>
        )}
      </div>

      {detail || detailLoading ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={detail ? `Playlist ${detail.title}` : "Loading playlist"}
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => {
            setDetail(null);
            setDetailLoading(false);
          }}
        >
          <div
            className="relative flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-separator bg-surface shadow-pop"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setDetail(null);
                setDetailLoading(false);
              }}
              aria-label="Close playlist"
              className="absolute end-3 top-3 z-10 grid size-9 place-items-center rounded-full text-muted backdrop-blur transition-colors hover:bg-surface-secondary hover:text-foreground"
            >
              <Icon name="x" className="size-4" />
            </button>

            <CollectionHero
              flush
              eyebrow="Playlist"
              title={detail?.title ?? "Loading…"}
              image={detail?.image}
              meta={
                detail
                  ? [
                      `${detail.songCount} ${detail.songCount === 1 ? "song" : "songs"}`,
                      detailRuntime,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : "Fetching tracks…"
              }
            >
              {detail?.songs.length ? (
                <RoundPlay
                  onClick={() => startQueue(detail.songs, detail.title, 0)}
                  label="Play playlist"
                >
                  <Icon name="play" size={18} className="fill-current" />
                </RoundPlay>
              ) : null}
            </CollectionHero>

            <div className={cn("min-h-0 flex-1 overflow-y-auto p-2 sm:p-3", !detail && "grid place-items-center py-16")}>
              {detail ? (
                detail.songs.length ? (
                  <>
                    <SongTableHead />
                    <SongRows
                      songs={detail.songs}
                      label={detail.title}
                      onRemove={detail.playlistId ? removeSong : undefined}
                      table
                    />
                  </>
                ) : (
                  <p className="px-4 py-10 text-center text-xs text-muted">
                    This playlist has no playable tracks.
                  </p>
                )
              ) : (
                <p className="text-xs text-muted">Loading tracks…</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
