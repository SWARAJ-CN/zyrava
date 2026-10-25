"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Icon } from "@/components/ui/icons";
import { REGIONS } from "./regions";
import { cn } from "@/lib/cn";

/**
 * The featured strip at the top of the library: one wide panel per region
 * that rotates on its own, pauses when the pointer or focus is on it, and
 * answers arrows / dots / arrow keys. Selecting a region opens its catalogue
 * below.
 *
 * Artwork sits in a square card on the right instead of stretching across
 * the whole panel — artwork on this CDN tops out at 500×500, so a full-bleed
 * cover would pixel-stretch. A dark gradient wash keeps the panel readable.
 */
interface RegionCarouselProps {
  /** Cover artwork per region label, fetched once by the page. */
  covers: Record<string, string>;
  /** Label of the region currently open in the library. */
  active: string;
  /** Queue label while that region's songs are playing, if any. */
  nowPlaying?: string;
  /** Cue the region up immediately — queues the first page and plays. */
  onPlay?: (label: string) => Promise<void> | void;
  /** Selects a region in the library below. */
  onSelect: (label: string) => void;
}

const ROTATE_MS = 6000;

export function RegionCarousel({ covers, active, nowPlaying, onPlay, onSelect }: RegionCarouselProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  /** Region whose play button is mid-fetch. */
  const [busy, setBusy] = useState("");
  const count = REGIONS.length;

  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count]
  );

  /** Play straight from the carousel — loading state until the queue lands. */
  const cue = (label: string) => {
    if (!onPlay || busy) return;
    setBusy(label);
    void Promise.resolve(onPlay(label)).finally(() => setBusy(""));
  };

  // Gentle autoplay; nothing rotates while the reader is interacting.
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => setIndex((value) => (value + 1) % count), ROTATE_MS);
    return () => clearInterval(timer);
  }, [paused, count]);

  // Arrow keys work from anywhere on the page, like Spotify's hero.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") go(index + 1);
      if (event.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured regions"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className="relative overflow-hidden rounded-xl border border-separator shadow-pop"
    >
      <div
        className="flex transition-transform duration-700 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {REGIONS.map((region, regionIndex) => (
          <div
            key={region.label}
            role="group"
            aria-roledescription="slide"
            aria-label={`${region.label} — ${region.hint}`}
            aria-hidden={regionIndex !== index}
            className={cn(
              "relative h-[180px] w-full flex-none sm:h-[230px] lg:h-[270px]",
              regionIndex !== index && "pointer-events-none"
            )}
          >
            {/* Tone wash + readable shade — no full-bleed cover stretching */}
            <div
              className="absolute inset-0"
              style={{ backgroundColor: region.tone }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/20" />

            <div className="relative flex h-full items-center justify-between gap-4 p-4 sm:gap-6 sm:p-8 lg:p-10">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/70 sm:text-[11px]">
                  <Icon name="music" className="size-3.5" />
                  Now in rotation · {region.hint}
                </p>
                <h2 className="mt-2 truncate text-4xl font-black tracking-tight text-white drop-shadow sm:text-5xl lg:text-6xl">
                  {region.label}
                </h2>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    tabIndex={regionIndex === index ? 0 : -1}
                    onClick={() => cue(region.label)}
                    className="group inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-bold text-black shadow-field transition-all duration-200 hover:scale-[1.04] hover:bg-white/90 active:scale-95 disabled:opacity-80 sm:text-sm"
                    disabled={busy === region.label}
                  >
                    <Icon
                      name={busy === region.label ? "loader" : "play"}
                      size={15}
                      className={cn(
                        "fill-black text-black transition-transform group-hover:scale-110",
                        busy === region.label && "animate-spin"
                      )}
                    />
                    {busy === region.label
                      ? "Loading…"
                      : nowPlaying === region.label
                        ? "Playing"
                        : `Play ${region.label}`}
                  </button>
                  {active === region.label ? (
                    <button
                      type="button"
                      tabIndex={regionIndex === index ? 0 : -1}
                      onClick={() => onSelect(region.label)}
                      className="hidden items-center gap-1.5 rounded-full border border-white/25 px-3 py-1 text-[11px] font-semibold text-white/85 transition-colors hover:border-white/50 hover:text-white sm:flex"
                    >
                      <span className="eq text-white">
                        <span /><span /><span />
                      </span>
                      Open library
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Square art card — crisp at any size, never stretched */}
              <div
                className={cn(
                  "relative aspect-square w-24 flex-none overflow-hidden rounded-lg border border-white/15 bg-black/30 shadow-pop sm:w-40 lg:w-52",
                  regionIndex === index && "motion-safe:animate-[carousel-pop_8s_ease-in-out_infinite]"
                )}
              >
                {covers[region.label] ? (
                  <Image
                    src={covers[region.label]}
                    alt=""
                    fill
                    priority={regionIndex === 0}
                    sizes="208px"
                    className="object-cover"
                  />
                ) : (
                  <span className="grid h-full place-items-center text-white/70">
                    <Icon name="music" className="size-8" />
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Arrows — glass circles on the midline, like standard hero rails */}
      <button
        type="button"
        onClick={() => go(index - 1)}
        aria-label="Previous region"
        className="absolute start-2.5 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/55 sm:start-3 sm:size-9 lg:size-10"
      >
        <Icon name="chevron-left" size={18} />
      </button>
      <button
        type="button"
        onClick={() => go(index + 1)}
        aria-label="Next region"
        className="absolute end-2.5 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/55 sm:end-3 sm:size-9 lg:size-10"
      >
        <Icon name="chevron-right" size={18} />
      </button>

      {/* Dots — pill shaped, the active one stretches */}
      <div className="absolute bottom-4 end-5 z-10 flex items-center gap-1.5">
        {REGIONS.map((region, dotIndex) => (
          <button
            key={region.label}
            type="button"
            aria-label={`Show ${region.label}`}
            aria-current={dotIndex === index}
            onClick={() => go(dotIndex)}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              dotIndex === index ? "w-7 bg-white" : "w-1.5 bg-white/45 hover:bg-white/70"
            )}
          />
        ))}
      </div>
    </section>
  );
}
