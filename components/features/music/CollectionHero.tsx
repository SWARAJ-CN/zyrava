"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * Spotify's collection header — a gradient band with the cover sitting on the
 * text block: eyebrow, oversized title, quiet meta line, then whatever actions
 * the view wants parked underneath (play, shuffle, add…).
 */
export function CollectionHero({
  eyebrow,
  title,
  meta,
  image,
  glyph = "list",
  tone = "brand",
  flush = false,
  children,
}: {
  eyebrow: string;
  title: string;
  meta: string;
  image?: string;
  glyph?: "list" | "heart" | "music";
  tone?: "brand" | "plain";
  /** Bleeds to the container's edges — for headers inside a dialog. */
  flush?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden px-4 pb-5 pt-6 sm:px-6",
        flush
          ? "border-b border-separator"
          : "rounded-xl border border-separator",
        tone === "brand"
          ? "bg-gradient-to-b from-brand-soft via-surface to-surface"
          : "bg-[radial-gradient(120%_100%_at_30%_0%,var(--surface-secondary),var(--surface))]"
      )}
    >
      <div className="flex items-end gap-4">
        <span className="relative size-24 flex-none overflow-hidden rounded-lg border border-separator bg-surface-secondary shadow-field sm:size-28">
          {image ? (
            <Image src={image} alt="" fill sizes="112px" className="object-cover" />
          ) : (
            <Icon
              name={glyph}
              className={cn(
                "absolute start-1/2 top-1/2 size-9 -translate-x-1/2 -translate-y-1/2",
                tone === "brand" ? "text-brand" : "text-faint-foreground"
              )}
            />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            {eyebrow}
          </p>
          <h2
            className="mt-1 truncate text-2xl font-black tracking-tight text-foreground sm:text-3xl lg:text-4xl"
            title={title}
          >
            {title}
          </h2>
          <p className="mt-1.5 line-clamp-2 text-xs text-muted">{meta}</p>
        </div>
      </div>

      {children ? <div className="mt-4 flex flex-wrap items-center gap-3">{children}</div> : null}
    </div>
  );
}

/**
 * Spotify's round green action pair — a solid play circle beside an outline
 * icon button (shuffle, follow…). Both stay quiet until touched.
 */
export function RoundPlay({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground shadow-pop transition-transform duration-150 hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}
