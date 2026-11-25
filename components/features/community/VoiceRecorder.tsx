"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, LockKeyhole, Square, Trash2, Loader2, ChevronLeft } from "lucide-react";
import { focusMedia } from "@/lib/media-focus";
import { Button, buttonClasses } from "@/components/ui/Button";

type Stage = "idle" | "requesting" | "recording" | "processing";
/** Pointer capture keeps hold/slide gestures intact outside the mic's hit area. */
export function VoiceRecorder({ onPreview, onActiveChange }: { onPreview: (file: File, duration: number) => void; onActiveChange: (active: boolean) => void }) {
  const resources = useRef({ generation: 0, stream: null as MediaStream | null, recorder: null as MediaRecorder | null, timer: null as ReturnType<typeof setInterval> | null });
  const gesture = useRef<{ x: number; y: number; at: number; locked: boolean } | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [locked, setLocked] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const active = stage !== "idle";
  const release = useCallback(() => {
    const r = resources.current;
    if (r.timer) clearInterval(r.timer);
    r.timer = null; r.stream?.getTracks().forEach(track => track.stop()); r.stream = null;
  }, []);
  const dispose = useCallback(() => {
    const r = resources.current; r.generation++;
    if (r.recorder) { r.recorder.onstop = null; r.recorder.ondataavailable = null; r.recorder.onerror = null; if (r.recorder.state !== "inactive") r.recorder.stop(); r.recorder = null; }
    release();
  }, [release]);
  useEffect(() => () => dispose(), [dispose]);
  useEffect(() => { onActiveChange(active); }, [active, onActiveChange]);
  const cancel = () => { gesture.current = null; dispose(); setStage("idle"); setLocked(false); setSeconds(0); };
  const stop = () => {
    gesture.current = null;
    const recorder = resources.current.recorder;
    if (recorder?.state === "recording") { setStage("processing"); recorder.stop(); }
  };
  const start = async (handsFree = false) => {
    if (resources.current.stream || stage !== "idle") return;
    setError(""); setLocked(handsFree); setSeconds(0);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Microphone recording needs HTTPS and a supported browser. You can attach an audio file instead."); return;
    }
    setStage("requesting"); const r = resources.current; const ticket = ++r.generation;
    try {
      focusMedia("voice-recording");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (ticket !== r.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      r.stream = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("This browser cannot record voice notes. Try attaching an audio file.");
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 96000 });
      r.recorder = recorder;
      const chunks: Blob[] = []; const started = Date.now(); let bytes = 0;
      recorder.ondataavailable = event => { if (event.data.size) { chunks.push(event.data); bytes += event.data.size; if (bytes >= 99_000_000) stop(); } };
      recorder.onerror = () => { cancel(); setError("Recording was interrupted. Please try again."); };
      recorder.onstop = () => {
        if (ticket !== r.generation) return;
        release(); r.recorder = null; gesture.current = null; setStage("idle"); setLocked(false);
        const type = recorder.mimeType.split(";")[0];
        const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const file = new File(chunks, `Voice note ${Date.now()}.${extension}`, { type });
        if (!file.size) { setError("No audio was captured. Please try again."); return; }
        onPreview(file, Math.max(1, (Date.now() - started) / 1000));
      };
      recorder.start(500); setStage("recording");
      r.timer = setInterval(() => { const elapsed = Math.floor((Date.now() - started) / 1000); setSeconds(elapsed); if (elapsed >= 180) stop(); }, 250);
    } catch (cause) {
      if (ticket !== r.generation) return;
      cancel(); setError(cause instanceof Error && cause.name === "NotAllowedError" ? "Microphone access was blocked. Allow it in your browser settings to record." : cause instanceof Error ? cause.message : "Couldn't open your microphone.");
    }
  };
  return <div className={active ? "flex w-full items-center gap-2" : "relative shrink-0"}>
    {active ? <>
      <Button variant="ghost" size="icon" aria-label="Discard voice recording" onClick={cancel} className="shrink-0 rounded-full text-danger"><Trash2 className="size-5" /></Button>
      <div className="min-w-0 flex-1" aria-live="polite">
        <p className="flex items-center gap-2 text-sm font-semibold tabular-nums"><span className="size-2 rounded-full bg-red-400 motion-safe:animate-pulse" />{stage === "requesting" ? "Allow microphone…" : stage === "processing" ? "Preparing preview…" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}{locked ? <LockKeyhole className="size-3.5 text-muted" /> : null}</p>
        <p className="mt-1 flex items-center gap-1 text-[10px] text-muted">{locked ? "Stop to review your voice note" : <><ChevronLeft className="size-3" />Slide left to cancel · up to lock</>}</p>
      </div>
      {locked && stage === "recording" ? <Button variant="secondary" size="icon" aria-label="Stop and preview voice message" onClick={stop} className="shrink-0 rounded-full"><Square className="size-4 fill-current" /></Button> : null}
    </> : null}
    <button type="button" aria-label={active ? "Recording voice message" : "Record voice message"} title="Hold to record; slide up to lock. Tap for hands-free recording."
      className={buttonClasses("primary", "icon", "size-11 shrink-0 touch-none select-none rounded-full")}
      onContextMenu={event => event.preventDefault()}
      onPointerDown={event => { if (stage !== "idle" || event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); gesture.current = { x: event.clientX, y: event.clientY, at: Date.now(), locked: false }; void start(); }}
      onPointerMove={event => { const g = gesture.current; if (!g || g.locked) return; if (event.clientX - g.x < -75) cancel(); else if (event.clientY - g.y < -65) { g.locked = true; setLocked(true); } }}
      onPointerUp={event => { const g = gesture.current; gesture.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (!g) return; if (g.locked || Date.now() - g.at < 350 || resources.current.recorder?.state !== "recording") setLocked(true); else stop(); }}
      onPointerCancel={cancel} onLostPointerCapture={() => { if (gesture.current && !gesture.current.locked) cancel(); }}
      onClick={event => { if (event.detail === 0 && stage === "idle") void start(true); }}>
      {stage === "requesting" || stage === "processing" ? <Loader2 className="size-5 animate-spin" /> : <Mic className="size-5" />}
    </button>
    {error ? <p role="alert" className="absolute bottom-full right-0 mb-3 w-[min(18rem,80vw)] rounded-xl bg-surface p-3 text-xs text-danger shadow-lg">{error}</p> : null}
  </div>;
}
