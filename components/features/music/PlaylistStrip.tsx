"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";

interface ApiPlaylist {
  id: string;
  title: string;
  image: string;
  songCount: number;
}

/**
 * A small row of catalogue playlists matching the current search, shown in
 * the Songs tab. Tapping one opens the Playlists tab with the same query.
 */
export function PlaylistStrip({ query, onOpen }: { query: string; onOpen: () => void }) {
  const [playlists, setPlaylists] = useState<ApiPlaylist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const frame = requestAnimationFrame(() => setLoading(true));

    fetch(`/api/music/playlists?q=${encodeURIComponent(query)}&limit=6`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { playlists?: ApiPlaylist[] } | null) => {
        if (alive) setPlaylists(Array.isArray(data?.playlists) ? data.playlists : []);
      })
      .catch(() => {
        if (alive) setPlaylists([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, [query]);

  if (!loading && !playlists.length) return null;

  return (
    <section className="mt-5">
      <div className="flex items-center justify-between gap-3 pb-2.5">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
          Playlists for “{query}”
        </h3>
        <button
          type="button"
          onClick={onOpen}
          className="text-[11px] font-medium text-muted transition-colors hover:text-foreground"
        >
          See all →
        </button>
      </div>

      <div className="scrollbar-none flex gap-3 overflow-x-auto pb-1">
        {loading
          ? Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="w-28 flex-none animate-pulse">
                <div className="aspect-square rounded-lg bg-surface-secondary" />
                <div className="mt-2 h-2.5 w-3/4 rounded bg-surface-secondary" />
              </div>
            ))
          : playlists.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                onClick={onOpen}
                title={`Open ${playlist.title}`}
                className="group w-28 flex-none text-start"
              >
                <span className="relative block aspect-square overflow-hidden rounded-lg border border-separator bg-surface-secondary">
                  {playlist.image ? (
                    <Image
                      src={playlist.image}
                      alt=""
                      fill
                      sizes="112px"
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <Icon
                      name="list"
                      className="absolute start-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 text-faint-foreground"
                    />
                  )}
                  <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <span className="absolute bottom-1.5 start-1.5 rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-semibold text-white/80 backdrop-blur">
                    {playlist.songCount}
                  </span>
                </span>
                <span className="mt-1.5 block truncate text-[11px] font-semibold text-foreground">
                  {playlist.title}
                </span>
              </button>
            ))}
      </div>
    </section>
  );
}
