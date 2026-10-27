"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

interface BeatGlowProps {
  /** The live analyser tap — the player hands it over; null before first play. */
  getAnalyser: () => AnalyserNode | null;
  /** Live status: a paused/empty stream glows down to its resting level. */
  playing: boolean;
  /** Starting point on the colour wheel, so a new track shifts the palette. */
  hueSeed?: number;
  className?: string;
}

/** Stable 0-359 colour-wheel offset for a track id. */
export function songHueSeed(id: string | null | undefined): number {
  if (!id) return 0;
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % 360;
}

/** Bass band the beat reading comes from: everything under ~250 Hz. */
const BASS_BINS = 24;
/** Reading smoothing: fast attack to the beat, slow release off it. */
const ATTACK = 0.55;
const RELEASE = 0.06;

/**
 * The Now-playing card's rotating RGB lights. Three blurred colour blobs
 * orbit behind the artwork; a requestAnimationFrame loop reads the analyser's
 * low band, computes a smoothed bass level and writes it to `--beat` along
 * with a slowly sweeping `--hue`, so the card's lights pulse with the track
 * and never sit the same colour two beats in a row.
 *
 * Purely decorative — aria-hidden, pointer-events none, and disabled for
 * reduced motion, where CSS keeps the blobs at a gentle static hue.
 */
export function BeatGlow({ getAnalyser, playing, hueSeed = 0, className }: BeatGlowProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = rootRef.current;
    if (!root) return;

    let frame = 0;
    let level = 0;
    const bins = new Uint8Array(BASS_BINS);

    const readBass = (analyser: AnalyserNode): number => {
      const full = new Uint8Array(Math.min(analyser.frequencyBinCount, BASS_BINS));
      analyser.getByteFrequencyData(full);
      // Cheap copy into our fixed-size window keeps the smoothing math simple.
      bins.set(full);
      let sum = 0;
      for (const value of bins) sum += value;
      return sum / (BASS_BINS * 255);
    };

    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      const analyser = getAnalyser();
      const target =
        analyser && playing
          ? Math.min(1, readBass(analyser) * 2.2) /* bass is usually well under full swing */
          : 0;
      level = target > level ? level + (target - level) * ATTACK : level + (target - level) * RELEASE;
      root.style.setProperty("--beat", level.toFixed(3));
      // One full colour wheel every 23 seconds, started at the track's seed.
      root.style.setProperty("--hue", ((((time / 23_000) % 1) * 360 + hueSeed) % 360).toFixed(1));
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [getAnalyser, playing, hueSeed]);

  return (
    <div ref={rootRef} aria-hidden className={cn("beat-glow", className)}>
      <i className="beat-glow-a" />
      <i className="beat-glow-b" />
      <i className="beat-glow-c" />
    </div>
  );
}
