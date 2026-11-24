"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import { ShareSongButton } from "@/components/features/music/ShareSongButton";
import { useMusicPlayer } from "@/components/providers/MusicPlayerProvider";
import { cn } from "@/lib/cn";
import type { Song } from "@/lib/saavn";

export function SharedSongPage({ song }: { song: Song | null }) {
  const { current, playing, startQueue, togglePlay, playerError, sidebarWide, setMobileNavOpen } = useMusicPlayer();
  const started = useRef<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    if (!song || started.current === song.id) return;
    started.current = song.id;
    if (current?.id !== song.id) startQueue([song], "Shared song", 0);
    else if (!playing) togglePlay();
  }, [song, current?.id, playing, startQueue, togglePlay]);

  const active = !!song && current?.id === song.id;
  const audible = active && playing;
  return (
    <main className={cn("dock-offset min-h-dvh px-5 pb-40 pt-8 sm:px-10", !sidebarWide && "dock-offset--rail")}>
      <button type="button" onClick={() => setMobileNavOpen(true)} className="mb-6 flex items-center gap-2 text-sm md:hidden" aria-label="Open navigation"><Icon name="menu" className="size-5" /> ZYRAVA</button>
      {song ? (
        <section className="mx-auto grid max-w-4xl items-center gap-8 py-6 md:grid-cols-2 md:py-16">
          <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-2xl bg-surface-secondary shadow-xl">
            {song.imageLarge || song.image ? <Image src={song.imageLarge || song.image} alt={song.title} fill priority sizes="(max-width:768px) 90vw, 448px" className="object-cover" /> : <Icon name="music" className="m-auto size-20" />}
          </div>
          <div className="min-w-0">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-brand">Shared with you</p>
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{song.title}</h1>
            <p className="mt-3 text-lg text-muted">{song.artist}</p>
            <p className="mt-1 text-sm text-muted">{song.album}</p>
            <div className="mt-7 flex items-center gap-3">
              <Button onClick={() => active ? togglePlay() : startQueue([song], "Shared song", 0)}>
                <Icon name={audible ? "pause" : "play"} className="size-5" />{audible ? "Pause" : "Play song"}
              </Button>
              <ShareSongButton song={song} />
            </div>
            <p role="status" className="mt-4 text-sm text-muted">{active && playerError ? playerError : audible ? "Playing on ZYRAVA" : "If playback doesn’t start automatically, tap Play song."}</p>
            <Link href="/" className="mt-8 inline-block text-sm font-semibold text-brand">Explore more music →</Link>
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-md py-20 text-center">
          <h1 className="text-2xl font-bold">This song couldn’t be loaded</h1>
          <p className="my-4 text-sm text-muted">It may be unavailable, or the music service may be temporarily offline.</p>
          <Button onClick={() => router.refresh()}>Try again</Button>
          <Link href="/" className="mt-6 block text-sm text-brand">Browse ZYRAVA</Link>
        </section>
      )}
    </main>
  );
}
