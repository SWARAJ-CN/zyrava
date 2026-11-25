"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Slider } from "@heroui/react";
import { Pause, Play, RotateCcw, AudioLines, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MEDIA_FOCUS_EVENT, focusMedia } from "@/lib/media-focus";

function clock(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export function AudioMessagePlayer({ src, name = "Voice message", durationHint = 0 }: { src: string; name?: string; durationHint?: number }) {
  const id = useId();
  const audio = useRef<HTMLAudioElement>(null);
  const scrubbing = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(0);
  const [measuredDuration, setDuration] = useState(0);
  const duration = measuredDuration || durationHint;
  const playRequest = useRef({ version: 0 });
  const [rate, setRate] = useState(1);
  const [error, setError] = useState(false);
  useEffect(() => {
    const element = audio.current;
    const requestState = playRequest.current;
    const pause = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) { playRequest.current.version++; element?.pause(); setLoading(false); } };
    window.addEventListener(MEDIA_FOCUS_EVENT, pause);
    return () => { requestState.version++; window.removeEventListener(MEDIA_FOCUS_EVENT, pause); element?.pause(); };
  }, [id]);
  const metadata = () => {
    const value = audio.current?.duration;
    if (value && Number.isFinite(value)) setDuration(value);
  };
  const toggle = async () => {
    const element = audio.current;
    if (!element) return;
    if (!element.paused || loading) { playRequest.current.version++; element.pause(); setLoading(false); return; }
    const request = ++playRequest.current.version;
    setError(false); setLoading(true); focusMedia(id);
    try {
      if (element.error) element.load();
      if (element.ended) element.currentTime = 0;
      await element.play();
    } catch { if (request === playRequest.current.version) setError(true); } finally { if (request === playRequest.current.version) setLoading(false); }
  };
  const seek = (value: number | number[]) => {
    const next = Array.isArray(value) ? value[0] : value;
    setTime(next);
    if (audio.current) { try { audio.current.currentTime = next; } catch { /* metadata not ready */ } }
  };
  return <div role="group" aria-label={`Audio player: ${name}`} className="w-full min-w-0 rounded-2xl bg-background/90 p-3 text-foreground shadow-sm">
    <audio ref={audio} src={src} preload="none" onLoadedMetadata={metadata} onDurationChange={metadata}
      onTimeUpdate={() => { if (!scrubbing.current) setTime(audio.current?.currentTime || 0); }}
      onPlay={() => { setPlaying(true); focusMedia(id); }} onPlaying={() => setLoading(false)}
      onPause={() => { setPlaying(false); setLoading(false); }} onEnded={() => { setPlaying(false); setTime(0); }}
      onWaiting={() => setLoading(true)} onError={() => { setError(true); setLoading(false); setPlaying(false); }} />
    <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted"><AudioLines aria-hidden className="size-3.5 text-accent" /><span className="min-w-0 truncate">{name.startsWith("Voice note") ? "Voice message" : name}</span></div>
    <div className="flex items-center gap-3">
      <Button variant="primary" size="icon" aria-label={error ? "Retry audio playback" : playing || loading ? "Pause audio" : "Play audio"} onClick={() => void toggle()} className="size-11 shrink-0 rounded-full">
        {loading ? <Loader2 className="size-4 animate-spin" /> : error ? <RotateCcw className="size-4" /> : playing ? <Pause className="size-4 fill-current" /> : <Play className="ms-0.5 size-4 fill-current" />}
      </Button>
      <div className="min-w-0 flex-1">
        <Slider aria-label="Audio playback position" minValue={0} maxValue={duration || 1} step={0.1} value={Math.min(time, duration || 1)} isDisabled={!duration || error}
          onChange={value => { scrubbing.current = true; seek(value); }} onChangeEnd={value => { seek(value); scrubbing.current = false; }} className="w-full py-2">
          <Slider.Track className="h-1.5 rounded-full"><Slider.Fill /><Slider.Thumb className="size-3" /></Slider.Track>
        </Slider>
        <div className="mt-1 flex justify-between gap-2 text-[10px] tabular-nums text-muted"><span>{clock(time)}</span><span>{clock(duration)}</span></div>
      </div>
    </div>
    <div className="mt-2 flex items-center justify-between gap-2">
      <span role="status" className="text-[10px] text-muted">{error ? "Couldn’t play. Tap to retry." : loading ? "Loading audio…" : playing ? "Playing" : "Tap play to listen"}</span>
      <Button variant="ghost" size="sm" aria-label={`Playback speed ${rate} times. Change speed`} onClick={() => { const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1; setRate(next); if (audio.current) audio.current.playbackRate = next; }} className="h-8 min-w-10 rounded-full px-2 text-[10px] font-semibold">{rate}×</Button>
    </div>
  </div>;
}
