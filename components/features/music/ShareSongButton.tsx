"use client";

import { useEffect, useRef, useState } from "react";
import { Mail, MessageCircle, Send, Share2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { prepareSongShareFile, songShareUrl, shareSongWithApps, songShareText } from "@/lib/song-share";
import type { Song } from "@/lib/saavn";

export function ShareSongButton({ song, className }: { song: Song; className?: string }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<{ song: Song; file: File } | null>(null);
  const sharingRef = useRef(false);
  const [sharing, setSharing] = useState(false);
  const [showApps, setShowApps] = useState(false);

  useEffect(() => {
    if (!navigator.share || !navigator.canShare?.({ files: [new File([""], "song.png", { type: "image/png" })] })) return;
    let alive = true;
    const prepare = () => {
      void prepareSongShareFile(song).then((file) => {
        if (alive && file) fileRef.current = { song, file };
      });
    };
    const button = buttonRef.current;
    if (!button || typeof IntersectionObserver === "undefined") {
      prepare();
      return () => { alive = false; };
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        prepare();
      }
    });
    observer.observe(button);
    return () => { alive = false; observer.disconnect(); };
  }, [song]);

  const share = () => {
    if (sharingRef.current) return;
    try {
      // No fetch or await before share(): Safari/Chrome need the original tap.
      const file = fileRef.current?.song === song ? fileRef.current.file : undefined;
      const result = shareSongWithApps(song, file);
      if (!result) { setShowApps(true); return; }
      sharingRef.current = true;
      setSharing(true);
      void result.catch((cause: unknown) => {
        if (!(cause instanceof Error && cause.name === "AbortError")) setShowApps(true);
      }).finally(() => { sharingRef.current = false; setSharing(false); });
    } catch {
      setShowApps(true);
    }
  };

  const text = songShareText(song);
  const linkClass = "flex items-center gap-3 rounded-xl bg-surface-secondary px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent-soft";
  return (
    <>
      <button ref={buttonRef} type="button" aria-label={`Share ${song.title}`} title="Share song" disabled={sharing} aria-busy={sharing}
        onClick={(event) => { event.stopPropagation(); share(); }}
        className={cn("grid size-8 flex-none place-items-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground disabled:opacity-50", className)}>
        <Share2 className="size-4" aria-hidden="true" />
      </button>
      {showApps ? (
        <Modal open onClose={() => setShowApps(false)} title="Share with" description="This browser can share the song link through these apps." size="sm">
          <div className="flex flex-col gap-2">
            <a className={linkClass} href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-5" /> WhatsApp</a>
            <a className={linkClass} href={`https://t.me/share/url?url=${encodeURIComponent(songShareUrl(song))}&text=${encodeURIComponent(`${song.title} — ${song.artist}`)}`} target="_blank" rel="noopener noreferrer"><Send className="size-5" /> Telegram</a>
            <a className={linkClass} href={`mailto:?subject=${encodeURIComponent(song.title)}&body=${encodeURIComponent(text)}`}><Mail className="size-5" /> Email</a>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
