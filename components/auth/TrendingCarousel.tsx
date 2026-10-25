"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pause } from "lucide-react";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { TrendingSlide } from "@/lib/trending";

const QUERIES = ["trending songs", "top hits", "new releases"];
const MAX_SLIDES = 8;

/** Collapse the same recording arriving from several trend queries. */
function slideKey(title: string, artist: string) {
  return `${title.toLowerCase().replace(/\s*[([].*?[)\]]\s*/g, " ").trim()}|${artist
    .toLowerCase()
    .trim()}`;
}

/**
 * The auth screen's "Trending now" carousel. It shows what the catalogue is
 * playing right now — artwork, title, artist — and deliberately has no play
 * control: it is a shop window, not a player.
 */
export function TrendingCarousel({
  compact = false,
  initialSlides = [],
}: {
  compact?: boolean;
  initialSlides?: TrendingSlide[];
}) {
  const [slides, setSlides] = useState<TrendingSlide[]>(initialSlides);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    // The server already rendered today's chart; only fetch when it could not.
    if (initialSlides.length >= 2) return;
    let alive = true;

    Promise.all(
      QUERIES.map((query) =>
        fetch(`/api/music/search?q=${encodeURIComponent(query)}&limit=6`, { cache: "no-store" })
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null)
      )
    )
      .then((results: Array<{ songs?: Array<Record<string, unknown>> } | null>) => {
        if (!alive) return;
        const seen = new Set<string>();
        const next: TrendingSlide[] = [];

        for (const result of results) {
          for (const song of result?.songs ?? []) {
            const title = String(song.title ?? "");
            const artist = String(song.artist ?? "");
            const image = String(song.imageLarge ?? song.image ?? "");
            if (!title || !image) continue;
            const key = slideKey(title, artist);
            if (seen.has(key)) continue;
            seen.add(key);
            next.push({
              id: String(song.id ?? key),
              title,
              artist,
              language: String(song.language ?? ""),
              image,
            });
            if (next.length >= MAX_SLIDES) break;
          }
          if (next.length >= MAX_SLIDES) break;
        }

        if (next.length) setSlides(next);
      })
      .catch(() => {
        /* The empty state below is the fallback. */
      });

    return () => {
      alive = false;
    };
  }, [initialSlides.length]);

  // Auto-advance unless the user paused it or asked for less motion.
  useEffect(() => {
    if (paused || slides.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % slides.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [paused, slides.length]);

  const current = slides.length ? slides[index % slides.length] : null;
  const total = slides.length;
  const position = total ? (index % total) + 1 : 0;

  const go = (delta: number) => {
    if (total < 2) return;
    setIndex((value) => (value + delta + total) % total);
  };

  const artwork = (sizes: string, className: string) =>
    current ? (
      <Image
        src={current.image}
        alt={`${current.title} cover art`}
        fill
        sizes={sizes}
        className={cn("object-cover", className)}
      />
    ) : (
      <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(120%_100%_at_30%_0%,var(--surface-secondary),var(--background))]">
        <Icon name="music" className="size-10 text-muted/40" />
      </div>
    );

  if (compact) {
    return (
      <div
        role="region"
        aria-roledescription="carousel"
        aria-label="Trending now"
        className="overflow-hidden rounded-2xl border border-separator bg-surface"
      >
        <div className="flex items-center gap-3 p-3">
          <div className="relative size-16 flex-none overflow-hidden rounded-xl bg-surface-secondary">
            {artwork("64px", "")}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-brand">
              Trending now
            </p>
            <p className="truncate pt-0.5 text-sm font-semibold text-foreground">
              {current?.title ?? "Reading the charts…"}
            </p>
            <p className="truncate text-[11px] text-muted">
              {current?.artist ?? "Fresh from the catalogue"}
            </p>
          </div>
          <div className="flex flex-none items-center gap-1">
            <button
              type="button"
              onClick={() => setPaused((value) => !value)}
              aria-pressed={paused}
              aria-label={paused ? "Resume the trending slides" : "Pause the trending slides"}
              title={paused ? "Resume slides" : "Pause slides"}
              className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
            >
              <Pause className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={total < 2}
              aria-label="Previous trending track"
              className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-secondary hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={total < 2}
              aria-label="Next trending track"
              className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-secondary hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between px-3 pb-2">
          <span className="text-[9px] font-medium uppercase tracking-wider text-faint-foreground">
            {total ? `${String(position).padStart(2, "0")} / ${String(total).padStart(2, "0")}` : "—"}
          </span>
          <div className="flex items-center gap-1">
            {slides.map((slide, slideIndex) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => setIndex(slideIndex)}
                aria-label={`Show trend ${slideIndex + 1}`}
                aria-current={slideIndex === index % Math.max(total, 1)}
                className={cn(
                  "h-1 rounded-full transition-all",
                  slideIndex === index % Math.max(total, 1)
                    ? "w-4 bg-accent"
                    : "w-1 bg-faint-foreground/40 hover:bg-muted"
                )}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Trending now"
      className="relative flex h-full min-h-[640px] flex-col overflow-hidden rounded-[1.6rem] border border-separator bg-surface"
    >
      {/* Cover bleed behind the panel. */}
      {current ? (
        <Image
          src={current.image}
          alt=""
          fill
          sizes="50vw"
          className="scale-110 object-cover opacity-25 blur-2xl"
          aria-hidden
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />

      <div className="relative flex h-full flex-col p-7">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">
              Trending now
            </p>
            <p className="pt-1.5 text-[11px] text-muted">The catalogue&apos;s most-played right now</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] tabular-nums tracking-wider text-faint-foreground">
              {total ? `${String(position).padStart(2, "0")} / ${String(total).padStart(2, "0")}` : "—"}
            </span>
            <button
              type="button"
              onClick={() => setPaused((value) => !value)}
              aria-pressed={paused}
              className="flex h-7 items-center gap-1 rounded-full border border-separator px-2.5 text-[9px] font-semibold uppercase tracking-wider text-muted transition-colors hover:text-foreground"
            >
              <Pause className="size-2.5" />
              {paused ? "Resume" : "Pause"}
            </button>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-[22rem]">
            <div className="relative aspect-square overflow-hidden rounded-[1.25rem] border border-white/10 bg-surface-secondary shadow-pop">
              {artwork("360px", "")}
            </div>
            <div className="mt-5 text-center">
              <p className="truncate text-lg font-semibold text-foreground">
                {current?.title ?? "Reading the charts…"}
              </p>
              <p className="truncate pt-1 text-xs text-muted">
                {current?.artist ?? "Fresh from the catalogue"}
              </p>
              {current?.language ? (
                <p className="mt-2.5 inline-flex rounded-full border border-separator px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-faint-foreground">
                  {current.language}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <footer>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={total < 2}
              aria-label="Previous trending track"
              className="grid size-9 place-items-center rounded-lg border border-separator text-muted transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="flex items-center gap-1.5">
              {slides.map((slide, slideIndex) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => setIndex(slideIndex)}
                  aria-label={`Show trend ${slideIndex + 1}`}
                  aria-current={slideIndex === index % Math.max(total, 1)}
                  className={cn(
                    "h-1 rounded-full transition-all",
                    slideIndex === index % Math.max(total, 1)
                      ? "w-5 bg-accent"
                      : "w-1.5 bg-faint-foreground/40 hover:bg-muted"
                  )}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={total < 2}
              aria-label="Next trending track"
              className="grid size-9 place-items-center rounded-lg border border-separator text-muted transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <p className="pt-4 text-center text-[9px] uppercase tracking-[0.18em] text-faint-foreground">
            Artwork from the catalogue · no preview playback
          </p>
        </footer>
      </div>
    </div>
  );
}
