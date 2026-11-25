"use client";
import { useEffect, useId, useRef } from "react";
import { ImagePreview } from "@/components/ui/ImagePreview";
import { AudioMessagePlayer } from "./AudioMessagePlayer";
import { MEDIA_FOCUS_EVENT, focusMedia } from "@/lib/media-focus";
import Image from "next/image";
import type { MediaAttachment } from "@/lib/media";

/** URLs are optimized and signed on the server; transforming them again would invalidate their signatures. */
export function ChatMedia({ attachment, onLoad }: { attachment: MediaAttachment; onLoad?: () => void }) {
  const id = useId();
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    const pause = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) element?.pause(); };
    window.addEventListener(MEDIA_FOCUS_EVENT, pause);
    return () => { window.removeEventListener(MEDIA_FOCUS_EVENT, pause); element?.pause(); };
  }, [id]);
  if (attachment.kind === "audio") return <div className="mb-2 w-[min(20rem,62vw)]"><AudioMessagePlayer key={attachment.url} src={attachment.url} name={attachment.name} durationHint={attachment.duration} /></div>;
  if (attachment.kind === "image") return <ImagePreview src={attachment.url} alt={attachment.name} width={attachment.width || 800} height={attachment.height || 600} label={`Open image: ${attachment.name}`} className="mb-2 block h-auto w-[min(20rem,62vw)] overflow-hidden rounded-xl bg-black/10">
    <Image unoptimized loading="eager" src={attachment.url} alt={attachment.name} width={attachment.width || 800} height={attachment.height || 600} sizes="(max-width: 640px) 75vw, 420px" className="max-h-80 w-full object-contain" onLoad={onLoad} />
  </ImagePreview>;
  return <div className="mb-2 w-[min(20rem,62vw)] overflow-hidden rounded-xl bg-black/10 p-2">
    <video ref={video} src={attachment.url} controls playsInline preload="none" className="max-h-80 w-full rounded-lg" aria-label={attachment.name} onLoadedMetadata={onLoad} onPlay={() => focusMedia(id)} />
    <p className="mt-1 truncate px-1 text-[11px] opacity-75">{attachment.name}</p>
  </div>;
}
