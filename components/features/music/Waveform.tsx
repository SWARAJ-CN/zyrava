"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Real-time spectrum bars driven by a Web Audio AnalyserNode.
 *
 * The canvas reads the analyser at animation-frame rate — no React state in
 * the loop, so 60 fps visuals cost nothing per tile. When no analyser is
 * attached (or playback is paused) the bars settle into a calm idle drift and
 * only wake up with actual audio energy.
 */
export interface WaveformProps {
  /** Accessor for the analyser; may return null while audio is unavailable. */
  getAnalyser: () => AnalyserNode | null;
  /** Whether the user considers this track "playing" — controls the idle drift. */
  active: boolean;
  className?: string;
  /** Rough gap ratio between bars; small visualisers get denser bars. */
  density?: number;
}

export function Waveform({ getAnalyser, active, className, density = 7 }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  const getAnalyserRef = useRef(getAnalyser);

  useEffect(() => {
    activeRef.current = active;
    getAnalyserRef.current = getAnalyser;
  }, [active, getAnalyser]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let bars = 3;
    let scale = 1;
    const heights: number[] = [];

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      scale = dpr;
      bars = Math.max(3, Math.floor(rect.width / density));
    };

    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    resize();

    // Grows bars outward with a logarithmic bin spread so low-heavy tracks
    // (the default!) don't light up only the left third.
    let running = true;
    // One reusable spectrum buffer; resized only when it doesn't match.
    const bufferRef = { data: new Uint8Array(0) };
    const draw = () => {
      if (!running) return;
      const width = canvas.width / scale;
      const height = canvas.height / scale;
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, width, height);
      // Inherit the surrounding text colour so bars theme themselves.
      context.fillStyle = getComputedStyle(canvas).color;

      const analyser = getAnalyserRef.current();
      let data: Uint8Array | null = null;
      if (analyser) {
        if (bufferRef.data.length !== analyser.frequencyBinCount) {
          bufferRef.data = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(bufferRef.data);
        data = bufferRef.data;
      }

      const barWidth = width / bars;
      const gap = Math.min(2, barWidth * 0.25);
      const inner = barWidth - gap;

      for (let index = 0; index < bars; index += 1) {
        if (heights[index] === undefined) heights[index] = 0.1;

        let target: number;
        if (data && analyser) {
          // Log-ish mapping: treat bins as power-of-two bands so each bar gets
          // its share of the spectrum instead of thin slices of silence.
          const from = Math.floor(Math.pow(data.length, index / bars));
          const to = Math.max(from + 1, Math.floor(Math.pow(data.length, (index + 1) / bars)));
          let sum = 0;
          for (let bin = from; bin < to && bin < data.length; bin += 1) sum += data[bin];
          const average = sum / (to - from);
          target = Math.max(average / 255, activeRef.current ? 0.03 : 0.06);
          target = Math.pow(target, 0.8); // tame the spikes
        } else {
          // Idle drift while there is nothing to sample.
          const time = performance.now() / 1000;
          target = 0.08 + 0.05 * Math.abs(Math.sin(time * 1.1 + index * 0.9));
        }

        // Smooth rise fast, fall slow — reads as "bouncy" not "flickery".
        heights[index] +=
          (target - heights[index]) * (heights[index] < target ? 0.55 : 0.16);

        const barHeight = Math.max(2, heights[index] * height);
        const x = index * barWidth + gap / 2;
        const y = height - barHeight;
        context.beginPath();
        context.roundRect(x, y, inner, barHeight, inner / 2);
        context.fill();
      }

      requestAnimationFrame(draw);
    };

    requestAnimationFrame(draw);
    return () => {
      running = false;
      observer.disconnect();
    };
  }, [density]);

  return <canvas ref={canvasRef} className={cn("block h-full w-full", className)} aria-hidden />;
}
