"use client";

import { useCallback, useState } from "react";
import { LyricsPanel } from "@/components/features/music/LyricsPanel";
import { RelatedSongs } from "@/components/features/music/RelatedSongs";
import type { Song } from "@/lib/saavn";
import { cn } from "@/lib/cn";

export type NowPlayingTab = "lyrics" | "related";

const TAB_KEY = "zyrava:now-playing-tab";

/**
 * Lyrics lead, because that is what someone looking at the card while a song
 * plays came for; the radio is one tap away and the choice is remembered.
 */
function readTab(): NowPlayingTab {
  if (typeof window === "undefined") return "lyrics";
  try {
    return window.localStorage.getItem(TAB_KEY) === "related" ? "related" : "lyrics";
  } catch {
    return "lyrics";
  }
}

/**
 * Held above the switch because the card needs the choice too: the artwork
 * gives up its square in lyrics mode so the words have a window worth reading.
 */
export function useNowPlayingTab(): [NowPlayingTab, (next: NowPlayingTab) => void] {
  const [tab, setTab] = useState<NowPlayingTab>(readTab);

  const choose = useCallback((next: NowPlayingTab) => {
    setTab(next);
    try {
      window.localStorage.setItem(TAB_KEY, next);
    } catch {
      /* Private mode or a full quota: the tab still switches for this session. */
    }
  }, []);

  return [tab, choose];
}

/**
 * The two things the now playing card shows about the current track.
 *
 * A Fragment, not a wrapper: the card's own column is what gives either panel a
 * bounded height, and inserting a div here would take `flex-1` away from the
 * panel and let sixty lyric rows push the playback buttons off the card.
 */
export function NowPlayingTabs({
  song,
  tab,
  onTab,
}: {
  song: Song;
  tab: NowPlayingTab;
  onTab: (next: NowPlayingTab) => void;
}) {
  return (
    <>
      <div className="mt-5 grid flex-none grid-cols-2 gap-1 rounded-xl border border-separator bg-surface p-1">
        {(["lyrics", "related"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={tab === option}
            onClick={() => onTab(option)}
            className={cn(
              "flex h-8 cursor-pointer items-center justify-center rounded-lg text-[11px] font-semibold transition-colors",
              tab === option
                ? "bg-accent text-accent-foreground"
                : "text-muted hover:text-foreground"
            )}
          >
            {option === "lyrics" ? "Lyrics" : "Related songs"}
          </button>
        ))}
      </div>

      {tab === "lyrics" ? <LyricsPanel song={song} /> : <RelatedSongs song={song} />}
    </>
  );
}
