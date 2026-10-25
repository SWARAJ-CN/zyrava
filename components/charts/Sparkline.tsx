"use client";

import { useId } from "react";
import { areaPath, smoothPath, type Point } from "./chart-utils";

interface SparklineProps {
  values: number[];
  color?: string;
  className?: string;
  width?: number;
  height?: number;
}

export function Sparkline({
  values,
  color = "var(--brand)",
  className,
  width = 120,
  height = 36,
}: SparklineProps) {
  const gradientId = useId();
  const series = values.length ? values : [0, 0];
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const span = max - min || 1;
  const padding = 3;

  const points: Point[] = series.map((value, index) => [
    (index / Math.max(1, series.length - 1)) * width,
    padding + (1 - (value - min) / span) * (height - padding * 2),
  ]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath(points, height)} fill={`url(#${gradientId})`} />
      <path
        d={smoothPath(points)}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
