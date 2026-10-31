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
 * The auth screen's trending gallery: cover art and the song's name, nothing
 * else. It is a shop window for the catalogue, not a player, so it carries no
 * play control and no caption.
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

  const total = slides.length;
  const active = total ? index % total : 0;
  const current = total ? slides[active] : null;

  const go = (delta: number) => {
    if (total < 2) return;
    setIndex((value) => (value + delta + total) % total);
  };

  /** Every slide is mounted so the change is a crossfade rather than a swap. */
  const artwork = (sizes: string, icon: string) => (
    <>
      {slides.map((slide, slideIndex) => (
        <div
          key={slide.id}
          aria-hidden={slideIndex !== active}
          className={cn(
            "absolute inset-0 transition-opacity duration-[900ms] ease-out",
            slideIndex === active ? "opacity-100" : "opacity-0"
          )}
        >
          <Image
            src={slide.image}
            alt={slideIndex === active ? `${slide.title} cover art` : ""}
            fill
            sizes={sizes}
            priority={slideIndex === 0}
            className="object-cover"
          />
        </div>
      ))}
      {current ? null : (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(120%_100%_at_30%_0%,var(--surface-secondary),var(--background))]">
          <Icon name="music" className={cn("text-muted/40", icon)} />
        </div>
      )}
    </>
  );

  /** The outgoing cover, smeared behind the panel so it never cuts flat. */
  const bleed = (sizes: string) => (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {slides.map((slide, slideIndex) => (
        <Image
          key={`bleed-${slide.id}`}
          src={slide.image}
          alt=""
          fill
          sizes={sizes}
          className={cn(
            "scale-110 object-cover blur-2xl transition-opacity duration-[1200ms] ease-out",
            slideIndex === active ? "opacity-30" : "opacity-0"
          )}
        />
      ))}
    </div>
  );

  const dots = (size: "sm" | "lg") =>
    slides.map((slide, slideIndex) => (
      <button
        key={slide.id}
        type="button"
        onClick={() => setIndex(slideIndex)}
        aria-label={slide.title}
        aria-current={slideIndex === active}
        className={cn(
          "rounded-full transition-all",
          size === "lg" ? "h-1.5" : "h-1",
          slideIndex === active
            ? size === "lg"
              ? "w-5 bg-accent"
              : "w-4 bg-accent"
            : size === "lg"
              ? "w-1.5 bg-faint-foreground/40 hover:bg-muted"
              : "w-1 bg-faint-foreground/40 hover:bg-muted"
        )}
      />
    ));

  if (compact) {
    return (
      <div
        role="region"
        aria-roledescription="carousel"
        aria-label="Trending"
        className="relative overflow-hidden rounded-2xl border border-separator bg-surface"
      >
        {bleed("100vw")}
        <div className="relative flex items-center gap-3.5 p-3">
          <div className="relative size-20 flex-none overflow-hidden rounded-xl border border-white/10 bg-surface-secondary shadow-pop">
            {artwork("80px", "size-5")}
          </div>
          <p
            className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-foreground"
            aria-live="polite"
          >
            {current?.title ?? ""}
          </p>
          <div className="flex flex-none items-center gap-1">
            <button
              type="button"
              onClick={() => setPaused((value) => !value)}
              aria-pressed={paused}
              aria-label={paused ? "Resume the trending slides" : "Pause the trending slides"}
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
        {total ? (
          <div className="relative flex items-center justify-center gap-1 pb-2.5">{dots("sm")}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Trending"
      className="relative flex h-full min-h-[640px] flex-col overflow-hidden rounded-[1.6rem] border border-separator bg-surface"
    >
      {bleed("50vw")}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />

      <div className="relative flex h-full flex-col p-7">
        <div className="flex flex-1 flex-col items-center justify-center gap-7 py-8">
          <div className="relative aspect-square w-full max-w-[24rem] overflow-hidden rounded-[1.4rem] border border-white/10 bg-surface-secondary shadow-pop">
            {artwork("384px", "size-10")}
          </div>
          <p
            className="line-clamp-2 max-w-[26rem] text-balance text-center text-xl font-semibold leading-snug tracking-tight text-foreground"
            aria-live="polite"
          >
            {current?.title ?? ""}
          </p>
        </div>

        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={total < 2}
            aria-label="Previous trending track"
            className="grid size-9 place-items-center rounded-full border border-separator text-muted transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="flex items-center gap-1.5">{dots("lg")}</div>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={total < 2}
            aria-label="Next trending track"
            className="grid size-9 place-items-center rounded-full border border-separator text-muted transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            aria-pressed={paused}
            aria-label={paused ? "Resume the trending slides" : "Pause the trending slides"}
            className="grid size-9 place-items-center rounded-full border border-separator text-muted transition-colors hover:border-border-strong hover:text-foreground"
          >
            <Pause className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
