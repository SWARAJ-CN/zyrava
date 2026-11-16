"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useAuth } from "@/components/providers/AuthProvider";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Minimize2 } from "lucide-react";
import { Icon } from "@/components/ui/icons";
import { useMusicPlayer } from "@/components/providers/MusicPlayerProvider";
import type { Song } from "@/lib/saavn";
import { formatSeconds } from "@/lib/lyrics";
import { LyricsPanel } from "./LyricsPanel";

const PersonalLyricsAnimation = dynamic(
  () => import("./PersonalLyricsAnimation").then((module) => module.PersonalLyricsAnimation),
  { ssr: false, loading: () => null },
);

/** Mounted in the app shell so phone/PWA layouts do not need the desktop card. */
export function LyricsFullscreenOverlay() {
  const { current, lyricsFullscreenOpen, setLyricsFullscreenOpen } =
    useMusicPlayer();
  if (!current || !lyricsFullscreenOpen) return null;
  return (
    <FullscreenLyrics
      song={current}
      onClose={() => setLyricsFullscreenOpen(false)}
    >
      <LyricsPanel song={current} immersive />
    </FullscreenLyrics>
  );
}

/** A top-layer reading view; the existing player remains the only audio owner. */
export function FullscreenLyrics({
  song,
  onClose,
  children,
}: {
  song: Song;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { personalExperience } = useAuth();
  const { playing, progress, togglePlay, stepTrack } = useMusicPlayer();
  const artwork = song.imageLarge || song.image;
  const elapsed = formatSeconds(Math.floor(progress));

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const previousGutter = document.documentElement.style.scrollbarGutter;
    document.documentElement.style.scrollbarGutter = "auto";
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.scrollbarGutter = previousGutter;
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label={`Fullscreen lyrics for ${song.title}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      data-personal-lyrics={personalExperience || undefined}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-[#111419] p-0 text-white backdrop:bg-black"
    >
      {/* The artwork itself supplies the palette, including cross-origin covers. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        {artwork && !personalExperience ? (
          <div
            key={artwork}
            className="absolute -inset-24 opacity-45 blur-[90px] saturate-75"
          >
            <Image
              src={artwork}
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
            />
          </div>
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/15" />
        {personalExperience ? (
          <div
            data-lyrics-hearts
            className="absolute inset-y-0 right-0 w-full opacity-25 [mask-image:linear-gradient(to_left,black,transparent)] motion-reduce:hidden md:w-[58%] md:opacity-35"
          >
            <PersonalLyricsAnimation />
          </div>
        ) : null}
      </div>

      <div className="relative flex h-full min-h-0 flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-10 lg:px-[7vw]">
        <div className="flex h-12 shrink-0 justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Exit fullscreen lyrics"
            title="Exit fullscreen (Esc)"
            className="grid size-11 place-items-center rounded-full text-white/65 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Minimize2 size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] items-center gap-5 sm:gap-10 lg:gap-[7vw]">
          <section
            aria-label="Song lyrics"
            className="flex h-full min-h-0 min-w-0 flex-col"
          >
            {children}
          </section>
          <div className="mx-auto w-full max-w-[min(35vw,58dvh)]">
            <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-white/5 shadow-[0_24px_90px_rgba(0,0,0,0.3)]">
              {artwork ? (
                <Image
                  src={artwork}
                  alt={`${song.title} artwork`}
                  fill
                  sizes="(min-width: 1024px) 35vw, 40vw"
                  className="object-cover"
                  priority
                />
              ) : (
                <div className="grid h-full place-items-center">
                  <Icon name="music" className="size-16 text-white/35" />
                </div>
              )}
            </div>
            <span
              role="timer"
              aria-label="Elapsed playback time"
              aria-live="off"
              className="mt-2 block text-left text-xs font-medium tabular-nums text-white/65 sm:text-sm"
            >
              {elapsed}
            </span>
          </div>
        </div>

        <div
          role="group"
          aria-label="Playback controls"
          className="flex shrink-0 items-center justify-center gap-7 pt-5 sm:pt-8"
        >
          <button
            type="button"
            onClick={() => stepTrack(-1)}
            aria-label="Previous song"
            className="grid size-12 place-items-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
          >
            <Icon name="skip-back" className="size-5 fill-current" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className="grid size-16 place-items-center rounded-full bg-white text-black shadow-lg transition-transform hover:scale-105 active:scale-95 motion-reduce:transform-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <Icon
              name={playing ? "pause" : "play"}
              className="size-6 fill-current"
            />
          </button>
          <button
            type="button"
            onClick={() => stepTrack(1)}
            aria-label="Next song"
            className="grid size-12 place-items-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
          >
            <Icon name="skip-forward" className="size-5 fill-current" />
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
