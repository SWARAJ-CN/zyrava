"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, FileAudio, FolderOpen, Image as ImageIcon, Mic, RotateCcw, Square, Video, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AUDIO_ACCEPT, PHOTO_ACCEPT, VIDEO_ACCEPT, validateFile, type MediaKind } from "@/lib/media";
import { focusMedia } from "@/lib/media-focus";
import { AudioMessagePlayer } from "./AudioMessagePlayer";
import { ChatPopover } from "./ChatPopover";
import { cn } from "@/lib/cn";

type Stage = "options" | "requesting" | "camera" | "recording" | "processing" | "preview";
type Capture = { file: File; url: string; duration: number };
const LIMIT_SECONDS = 180;
const MAX_CAPTURE_BYTES = 99_000_000;
const LABELS = { audio: "Mic", video: "Video", image: "Image" };

export function AttachmentPicker({ anchor, onClose, onChoose }: { anchor: HTMLElement; onClose: () => void; onChoose: (file: File, duration?: number) => void }) {
  const gallery = useRef<HTMLInputElement>(null);
  const deviceCamera = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const generation = useRef(0);
  const previewUrl = useRef<string | null>(null);
  const [kind, setKind] = useState<MediaKind>("audio");
  const [stage, setStage] = useState<Stage>("options");
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<Capture | null>(null);
  const [error, setError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);

  const releaseDevices = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);
  const dispose = useCallback(() => {
    generation.current++;
    const active = recorder.current; recorder.current = null;
    if (active) { active.ondataavailable = null; active.onstop = null; active.onerror = null; if (active.state !== "inactive") active.stop(); }
    releaseDevices();
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
  }, [releaseDevices]);
  useEffect(() => () => dispose(), [dispose]);

  const reset = (next = kind) => {
    dispose(); setResult(null); setStage("options"); setSeconds(0); setCameraReady(false); setError(""); setKind(next);
  };
  const showPreview = (file: File, duration: number) => {
    validateFile(file);
    const url = URL.createObjectURL(file); previewUrl.current = url;
    setResult({ file, url, duration }); setStage("preview");
  };
  const record = (input: MediaStream, type: "audio" | "video", ticket: number) => {
    const candidates = type === "audio" ? ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"] : ["video/webm;codecs=vp8,opus", "video/mp4", "video/webm"];
    const mimeType = candidates.find(value => MediaRecorder.isTypeSupported(value));
    if (!mimeType) throw new Error("Recording isn't supported in this browser. Choose a file instead.");
    const active = new MediaRecorder(input, { mimeType, audioBitsPerSecond: 96000, ...(type === "video" ? { videoBitsPerSecond: 900000 } : {}) });
    recorder.current = active;
    const chunks: Blob[] = []; let bytes = 0; const started = Date.now();
    const stop = () => { if (active.state === "recording") { setStage("processing"); active.stop(); } };
    active.ondataavailable = event => { if (event.data.size) { chunks.push(event.data); bytes += event.data.size; if (bytes >= MAX_CAPTURE_BYTES) stop(); } };
    active.onerror = () => {
      if (generation.current !== ticket) return;
      dispose(); setStage("options"); setError("The recording was interrupted. Please try again.");
    };
    active.onstop = () => {
      if (generation.current !== ticket) return;
      releaseDevices(); recorder.current = null;
      const baseType = active.mimeType.split(";")[0];
      const extension = baseType.includes("mp4") ? type === "audio" ? "m4a" : "mp4" : baseType.includes("ogg") ? "ogg" : "webm";
      const file = new File(chunks, `${type === "audio" ? "Voice note" : "Video"} ${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`, { type: baseType });
      try { showPreview(file, Math.max(1, (Date.now() - started) / 1000)); }
      catch(cause) { setError(cause instanceof Error ? cause.message : "Couldn't save this recording."); setStage("options"); }
    };
    focusMedia("capture"); active.start(500); setStage("recording"); setSeconds(0);
    timer.current = setInterval(() => { const elapsed = Math.floor((Date.now() - started) / 1000); setSeconds(elapsed); if (elapsed >= LIMIT_SECONDS) stop(); }, 250);
  };
  const openDevice = async () => {
    if (stage !== "options") return;
    if (!navigator.mediaDevices?.getUserMedia) { setError("Camera and microphone access needs HTTPS and a supported browser. You can still choose a file."); return; }
    if (kind !== "image" && typeof MediaRecorder === "undefined") { setError("This browser can't record. Choose a file or use your device camera."); return; }
    setError(""); setStage("requesting"); const ticket = ++generation.current;
    try {
      if (kind === "audio") focusMedia("capture");
      const input = await navigator.mediaDevices.getUserMedia({ audio: kind !== "image", video: kind !== "audio" ? { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } : false });
      if (generation.current !== ticket) { input.getTracks().forEach(track => track.stop()); return; }
      stream.current = input;
      if (kind === "audio") record(input, "audio", ticket);
      else {
        setStage("camera");
        if (video.current) { video.current.srcObject = input; await video.current.play(); }
      }
    } catch(cause) {
      if (generation.current !== ticket) return;
      dispose(); setStage("options");
      const code = cause instanceof Error ? cause.name : "";
      setError(code === "NotAllowedError" ? "Access was blocked. Allow camera or microphone access in your browser, or choose a file."
        : code === "NotFoundError" ? "No camera or microphone was found. You can choose a file instead."
        : cause instanceof Error ? cause.message : "Couldn't open your camera or microphone.");
    }
  };
  const takePhoto = () => {
    const element = video.current;
    if (!element?.videoWidth) return;
    setStage("processing"); const ticket = generation.current;
    const canvas = document.createElement("canvas"); const ratio = Math.min(1, 1600 / element.videoWidth);
    canvas.width = Math.round(element.videoWidth * ratio); canvas.height = Math.round(element.videoHeight * ratio);
    canvas.getContext("2d")?.drawImage(element, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (generation.current !== ticket) return;
      releaseDevices();
      if (!blob) { setError("Couldn't take that photo. Please try again."); setStage("options"); return; }
      showPreview(new File([blob], `Photo ${Date.now()}.jpg`, { type: "image/jpeg" }), 0);
    }, "image/jpeg", 0.88);
  };
  const chooseFile = (file?: File) => {
    if (!file) return;
    try { validateFile(file); onChoose(file); } catch(cause) { setError(cause instanceof Error ? cause.message : "Choose a supported file."); }
  };
  const busy = stage === "requesting" || stage === "processing";
  const recording = stage === "recording";
  return <ChatPopover anchor={anchor} title="Share a moment" placement="top start" media onClose={onClose}>
    <div className="p-2 sm:p-3">
      <header className="flex items-start justify-between gap-3"><div><h2 id="attachment-picker-title" className="text-base font-semibold tracking-tight">Share a moment</h2><p className="mt-1 text-xs text-muted">A voice note, a video, or a little snapshot.</p></div><Button variant="ghost" size="icon" aria-label="Close attachment picker" onClick={onClose} className="size-10 shrink-0 rounded-full"><X className="size-4" /></Button></header>
      <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Attachment type">
        {(["audio", "video", "image"] as const).map(type => { const Glyph = type === "audio" ? Mic : type === "video" ? Video : ImageIcon;
          return <Button key={type} variant={kind === type ? "primary" : "secondary"} aria-pressed={kind === type} onClick={() => reset(type)} className="h-18 w-full flex-col gap-1.5 rounded-xl text-xs"><Glyph aria-hidden className="size-6" strokeWidth={1.6} />{LABELS[type]}</Button>;
        })}
      </div>
      <input ref={gallery} type="file" className="hidden" aria-label="Choose media file" accept={kind === "audio" ? AUDIO_ACCEPT : kind === "video" ? VIDEO_ACCEPT : PHOTO_ACCEPT} onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = ""; }} />
      <input ref={deviceCamera} type="file" className="hidden" aria-label="Capture with device camera" accept={kind === "video" ? "video/*" : "image/*"} capture="environment" onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = ""; }} />
      <div className="mt-3 rounded-xl bg-surface p-3">
        {/* Always mounted so a granted stream can be attached before the next render. */}
        <video ref={video} muted playsInline autoPlay onLoadedMetadata={() => setCameraReady(true)} aria-label="Live camera preview" className={cn("mb-4 max-h-56 w-full rounded-xl bg-black object-contain", kind === "audio" || !["camera", "recording"].includes(stage) ? "hidden" : "block")} />
        {stage === "options" ? <div className="space-y-2">
          <Button onClick={() => void openDevice()} className="h-12 w-full justify-start gap-3 rounded-xl text-sm"><span className="grid size-7 place-items-center">{kind === "audio" ? <Mic className="size-5" /> : <Camera className="size-5" />}</span>{kind === "audio" ? "Record voice" : kind === "video" ? "Open video camera" : "Open camera"}</Button>
          <Button variant="ghost" onClick={() => gallery.current?.click()} className="h-12 w-full justify-start gap-3 rounded-xl text-sm"><span className="grid size-7 place-items-center">{kind === "audio" ? <FileAudio className="size-5" /> : <FolderOpen className="size-5" />}</span>{kind === "audio" ? "Choose audio file" : kind === "video" ? "Choose video" : "Choose image"}</Button>
          {kind !== "audio" ? <Button variant="ghost" size="sm" onClick={() => deviceCamera.current?.click()} className="w-full text-xs text-muted">Use device camera instead</Button> : null}
        </div> : null}
        {stage === "camera" ? <Button disabled={!cameraReady} onClick={() => {
          if (kind === "image") takePhoto();
          else if (stream.current) { try { record(stream.current, "video", generation.current); } catch(cause) { reset(); setError(cause instanceof Error ? cause.message : "Couldn't record video."); } }
        }} className="h-12 w-full gap-2 rounded-xl"><Camera className="size-4" />{kind === "image" ? "Take photo" : "Start recording"}</Button> : null}
        {recording ? <div className="text-center"><div className="mb-4 flex items-center justify-center gap-2"><span className="size-2 rounded-full bg-red-400 motion-safe:animate-pulse" /><span className="text-xl font-semibold tabular-nums">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span><span className="sr-only" role="status">Recording</span></div><Button onClick={() => { if (recorder.current?.state === "recording") { setStage("processing"); recorder.current.stop(); } }} className="h-12 w-full gap-2 rounded-xl"><Square className="size-4 fill-current" />Stop recording</Button><p className="mt-3 text-[10px] text-muted">Up to 3 minutes. You can review it before sending.</p></div> : null}
        {busy ? <div className="py-5 text-center"><p role="status" className="text-sm text-muted">{stage === "requesting" ? "Waiting for camera or microphone access…" : "Preparing your preview…"}</p><Button variant="ghost" size="sm" onClick={() => reset()} className="mt-3">Cancel</Button></div> : null}
        {result && stage === "preview" ? <div>
          {kind === "audio" ? <AudioMessagePlayer key={result.url} src={result.url} name="Voice note preview" durationHint={result.duration} /> : kind === "image" ? <Image unoptimized loading="eager" src={result.url} width={640} height={480} alt="Photo preview" className="max-h-56 w-full rounded-xl object-contain" /> : <video src={result.url} controls playsInline preload="metadata" className="max-h-56 w-full rounded-xl" aria-label="Recorded video preview" onPlay={() => focusMedia("capture-preview")} />}
          <div className="mt-4 flex gap-2"><Button onClick={() => onChoose(result.file, result.duration)} className="h-11 flex-1 gap-2 rounded-xl"><Check className="size-4" />Use {kind === "audio" ? "voice note" : kind === "image" ? "photo" : "video"}</Button><Button variant="secondary" size="icon" aria-label="Retake recording" onClick={() => reset()} className="size-11 rounded-xl"><RotateCcw className="size-4" /></Button></div>
        </div> : null}
      </div>
      {error ? <p role="alert" className="mt-3 text-xs leading-relaxed text-danger-soft-foreground">{error}</p> : null}
    </div>
  </ChatPopover>;
}
