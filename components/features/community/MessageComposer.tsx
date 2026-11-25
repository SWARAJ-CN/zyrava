"use client";
import { ProgressBar, TextArea } from "@heroui/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Paperclip, X, Send, Loader2, Reply } from "lucide-react";
import { AttachmentPicker } from "./AttachmentPicker";
import { AudioMessagePlayer } from "./AudioMessagePlayer";
import { VoiceRecorder } from "./VoiceRecorder";
import { Button } from "@/components/ui/Button";
import { focusMedia } from "@/lib/media-focus";
import { discardMedia, uploadMedia, validateFile, type MediaAttachment } from "@/lib/media";
import { MAX_CHAT_MESSAGE, type MessageItem } from "@/lib/community";

export function MessageComposer({ conversationId, name, draft, setDraft, onSend, onTyping, onStopTyping, reply, onCancelReply }: {
  conversationId: string; name: string; draft: string; setDraft: (value: string) => void;
  onSend: (text: string, attachment?: MediaAttachment) => Promise<boolean>; onTyping: () => void; onStopTyping: () => void;
  reply?: MessageItem | null; onCancelReply?: () => void;
}) {
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);
  const attachmentButton = useRef<HTMLButtonElement>(null);
  const [recording, setRecording] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const controller = useRef<AbortController | null>(null);
  const readyRef = useRef<MediaAttachment | null>(null);
  const [selected, setSelected] = useState<{ file: File; preview: string; kind: string; duration: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  useEffect(() => () => { controller.current?.abort(); if (readyRef.current) void discardMedia(readyRef.current.id); }, []);
  useEffect(() => () => { if (selected) URL.revokeObjectURL(selected.preview); }, [selected]);
  const remove = () => {
    controller.current?.abort(); controller.current = null;
    if (readyRef.current) void discardMedia(readyRef.current.id);
    readyRef.current = null; setSelected(null); setUploading(false); setError("");
  };
  const choose = (file: File, duration = 0) => {
    remove(); setRecording(false);
    try { const kind = validateFile(file); setSelected({ file, preview: URL.createObjectURL(file), kind, duration }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Choose a supported file."); }
  };
  const submit = async () => {
    if (sendingRef.current || recording || !draft.trim() && !selected) return;
    sendingRef.current = true; setSending(true); setError("");
    const abort = new AbortController(); controller.current = abort;
    try {
      let media: MediaAttachment | undefined;
      if (selected) {
        focusMedia("send-attachment"); setUploading(true); setProgress(0);
        media = await uploadMedia(selected.file, { purpose: "chat", conversation: conversationId, signal: abort.signal, onProgress: setProgress });
        if (abort.signal.aborted || controller.current !== abort) { void discardMedia(media.id); return; }
        readyRef.current = media;
      }
      if (abort.signal.aborted) return;
      // The optimistic message owns this upload, including failed-send retries.
      readyRef.current = null; setSelected(null); setUploading(false);
      const text = draft; setDraft(""); onStopTyping();
      await onSend(text, media);
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "Couldn't upload. Please try again.");
    } finally { sendingRef.current = false; setSending(false); setUploading(false); textarea.current?.focus(); }
  };
  return <footer className="community-composer max-h-[60dvh] flex-none overflow-y-auto border-t border-dock-line bg-background px-3 py-3 sm:px-6">
    {reply ? <div className="mb-3 flex items-center gap-3 rounded-xl border-l-2 border-accent bg-surface-secondary p-3"><Reply className="size-4 shrink-0 text-accent" /><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-accent">Replying to {reply.mine ? "yourself" : name}</p><p className="truncate text-xs text-muted">{reply.text || (reply.attachment?.kind === "image" ? "Photo" : reply.attachment?.kind === "video" ? "Video" : "Voice message")}</p></div><Button variant="ghost" size="icon" onClick={onCancelReply} aria-label="Cancel reply" className="size-8"><X className="size-4" /></Button></div> : null}
    {selected ? <div className="mb-3 overflow-hidden rounded-2xl border border-dock-line bg-surface-secondary/40 p-3">
      <div className="mb-3 flex items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{selected.file.name.startsWith("Voice note ") ? "Voice message" : selected.file.name}</p><p role="status" className="mt-1 text-[11px] text-muted">{uploading ? progress >= 95 ? "Finishing upload…" : `Uploading ${progress}%` : "Preview · not sent yet"}</p></div><Button variant="ghost" size="icon" onClick={remove} aria-label={uploading ? "Cancel upload" : "Remove attachment"} className="size-9 rounded-full"><X className="size-4" /></Button></div>
      {selected.kind === "image" ? <Image src={selected.preview} unoptimized loading="eager" width={640} height={480} alt="Attachment preview" className="max-h-52 w-full rounded-xl object-contain" />
        : selected.kind === "video" ? <video src={selected.preview} controls playsInline preload="metadata" aria-label="Video preview" className="max-h-52 w-full rounded-xl" onPlay={() => focusMedia("attachment-preview")} />
        : <AudioMessagePlayer key={selected.preview} src={selected.preview} name="Voice note preview" durationHint={selected.duration} />}
      {uploading ? <ProgressBar aria-label="Upload progress" value={progress} maxValue={100} className="mt-3 w-full"><ProgressBar.Track className="h-1"><ProgressBar.Fill /></ProgressBar.Track></ProgressBar> : null}
    </div> : null}
    {error ? <p role="alert" className="mb-2 text-xs text-danger-soft-foreground">{error}</p> : null}
    {pickerAnchor ? <AttachmentPicker anchor={pickerAnchor} onClose={() => setPickerAnchor(null)} onChoose={(file, duration) => { setPickerAnchor(null); choose(file, duration); }} /> : null}
    <div className="flex items-end gap-2">
      <Button ref={attachmentButton} variant="ghost" size="icon" hidden={recording} disabled={sending} onClick={() => setPickerAnchor(current => current ? null : attachmentButton.current)} aria-haspopup="dialog" aria-expanded={!!pickerAnchor} aria-label="Attach image, video or audio" title="Attach image, video or audio" className={`${recording ? "hidden" : ""} size-11 shrink-0 rounded-xl text-muted hover:bg-surface-secondary hover:text-foreground`}><Paperclip className="size-5" /></Button>
      <TextArea ref={textarea} value={draft} rows={1} hidden={recording} disabled={sending} maxLength={MAX_CHAT_MESSAGE} aria-label={`Message to ${name}`} placeholder={selected ? "Add a caption…" : "Write a message…"}
        onChange={event => { setDraft(event.target.value); onTyping(); }} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }}
        className={`${recording ? "hidden" : ""} max-h-32 min-h-11 min-w-0 flex-1 resize-y rounded-2xl border border-dock-line bg-surface-secondary/50 px-3 py-2.5 text-base text-foreground outline-none focus:border-brand`} />
      {!selected && !draft.trim() && !sending ? <VoiceRecorder onPreview={choose} onActiveChange={setRecording} /> : !selected ? <Button onClick={() => void submit()} disabled={sending} size="icon" aria-label="Send message" className="size-11 shrink-0 rounded-full">{sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</Button> : null}
    </div>
    {selected ? <Button onClick={() => void submit()} disabled={sending} className="mt-3 h-11 w-full gap-2 rounded-xl text-sm">{sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}{sending ? "Sending…" : "Confirm & send"}</Button> : null}
  </footer>;
}
