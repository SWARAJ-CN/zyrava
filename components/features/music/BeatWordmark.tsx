"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface BeatWordmarkProps {
  /** The live analyser tap — the player hands it over; null before first play. */
  getAnalyser: () => AnalyserNode | null;
  playing: boolean;
  /** Starting point on the colour wheel, so a new track shifts the palette. */
  hueSeed?: number;
  className?: string;
  children: ReactNode;
}

/* Bass band the beat is read from: everything under ~250 Hz. */
const BASS_BINS = 24;
/* The fill climbs onto a hit and drains slowly off it, so the colour rises
   with the beat instead of flickering with it. */
const ATTACK = 0.5;
const RELEASE = 0.07;
/* How fast the reference level follows the track's own loudness. Slow, so a
   quiet passage still shows its beats and a loud one does not pin the meter. */
const FOLLOW = 0.012;
/** One full colour wheel every 40 seconds. */
const DRIFT = 360 / 40_000;

/**
 * The oversized wordmark with the RGB *inside* the letterforms, rising from
 * the floor of the text toward its ceiling on every beat. Two layers share one
 * box: the faint watermark as it always looked, and a rainbow clipped to the
 * glyphs that a mask uncovers from the bottom up by `--fill` — the smoothed
 * beat level read off the analyser's low band each animation frame. The level
 * is measured against the track's own running average, so a loud mix does not
 * pin the colour at the top of the letters.
 *
 * Purely decorative — aria-hidden, and the loop never starts for reduced
 * motion, where CSS keeps a still, faint wash at the foot of the wordmark.
 */
export function BeatWordmark({
  getAnalyser,
  playing,
  hueSeed = 0,
  className,
  children,
}: BeatWordmarkProps) {
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = rootRef.current;
    if (!root) return;

    let frame = 0;
    let fill = 0;
    let reference = -1;
    let bins = new Uint8Array(0);

    const readBass = (analyser: AnalyserNode): number => {
      const size = Math.min(analyser.frequencyBinCount, BASS_BINS);
      if (bins.length !== size) bins = new Uint8Array(size);
      analyser.getByteFrequencyData(bins);
      let sum = 0;
      for (const value of bins) sum += value;
      return sum / (size * 255);
    };

    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      const analyser = getAnalyser();
      const bass = analyser && playing ? readBass(analyser) : 0;
      if (reference < 0) reference = bass;
      reference += (bass - reference) * FOLLOW;
      const pulse = Math.min(1, Math.max(0, (bass - reference * 1.1) / (reference * 0.9 + 0.06)));
      fill = pulse > fill ? fill + (pulse - fill) * ATTACK : fill + (pulse - fill) * RELEASE;
      root.style.setProperty("--fill", fill.toFixed(3));
      root.style.setProperty("--hue", ((hueSeed + time * DRIFT) % 360).toFixed(1));
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [getAnalyser, playing, hueSeed]);

  return (
    <span ref={rootRef} aria-hidden className={cn("beat-wordmark", className)}>
      <span className="text-foreground/[0.045]">{children}</span>
      <span className="beat-wordmark-rgb">{children}</span>
    </span>
  );
}
