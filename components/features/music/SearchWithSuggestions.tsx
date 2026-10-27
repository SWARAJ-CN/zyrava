"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { SearchInput } from "@/components/ui/Controls";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { Song } from "@/lib/saavn";

interface SearchWithSuggestionsProps {
  value: string;
  onChange: (value: string) => void;
  onPick: (song: Song) => void;
  /** Enter with a phrase: the page scrolls the list into view. */
  onCommit?: (value: string) => void;
  className?: string;
}

/**
 * The home search box plus its instant suggestion tray. Empty query shows
 * what is trending; typing shows matching songs. Picking one starts it.
 */
export function SearchWithSuggestions({
  value,
  onChange,
  onPick,
  onCommit,
  className,
}: SearchWithSuggestionsProps) {
  const [open, setOpen] = useState(false);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const query = value.trim();

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      const search = query.length >= 2 ? query : "trending songs";
      fetch(`/api/music/search?q=${encodeURIComponent(search)}&limit=6`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { songs?: Song[] } | null) => {
          if (!controller.signal.aborted) setSongs((data?.songs ?? []).slice(0, 6));
        })
        .catch(() => {
          /* keep the previous tray instead of flashing empty */
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 260);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={cn("relative", className)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
        if (event.key === "Enter" && query.length >= 2) {
          setOpen(false);
          onCommit?.(query);
        }
      }}
    >
      <div onFocus={() => setOpen(true)}>
        <SearchInput
          value={value}
          onChange={(next) => {
            onChange(next);
            setOpen(true);
          }}
          placeholder="Search songs, artists or albums…"
          className="w-full"
        />
      </div>

      {open ? (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-separator bg-surface shadow-pop">
          <p className="px-3.5 pb-1.5 pt-2.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-faint-foreground">
            {query.length >= 2 ? "Songs" : "Trending near you"}
          </p>
          <div className="max-h-80 overflow-y-auto pb-1">
            {loading && !songs.length ? (
              <p className="px-3.5 py-4 text-xs text-muted">Searching…</p>
            ) : null}
            {!loading && !songs.length ? (
              <p className="px-3.5 py-4 text-xs text-muted">
                {query.length >= 2 ? "No matches yet — keep typing." : "Nothing trending right now."}
              </p>
            ) : null}
            {songs.map((song) => (
              <button
                key={song.id}
                type="button"
                onClick={() => {
                  onPick(song);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-start transition-colors hover:bg-surface-secondary"
              >
                <span className="relative size-9 flex-none overflow-hidden rounded-md bg-surface-muted">
                  {song.image ? (
                    <Image
                      src={song.image}
                      alt=""
                      width={72}
                      height={72}
                      sizes="36px"
                      className="size-full object-cover"
                    />
                  ) : (
                    <Icon name="music" className="m-auto size-4 text-faint-foreground" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold text-foreground">
                    {song.title}
                  </span>
                  <span className="block truncate text-[10px] text-muted">{song.artist}</span>
                </span>
                <Icon name="play" className="size-3.5 flex-none fill-current text-faint-foreground" />
              </button>
            ))}
          </div>
          {query.length >= 2 ? (
            <p className="border-t border-separator px-3.5 py-2 text-[10px] text-faint-foreground">
              Press Enter to search the full catalogue
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
