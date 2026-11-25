"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Camera, Check, Trash2, X } from "lucide-react";
import { ProgressBar } from "@heroui/react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ImagePreview } from "@/components/ui/ImagePreview";
import { useAuth } from "@/components/providers/AuthProvider";
import { PHOTO_ACCEPT, discardMedia, uploadMedia, type MediaAttachment } from "@/lib/media";

export function ProfileSettings() {
  const { user, updateProfile } = useAuth();
  const picker = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const pending = useRef<MediaAttachment | null>(null);
  const [photo, setPhoto] = useState<MediaAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => () => { abort.current?.abort(); if (pending.current) void discardMedia(pending.current.id); }, []);
  const cancel = () => {
    abort.current?.abort(); abort.current = null;
    if (pending.current) void discardMedia(pending.current.id);
    pending.current = null; setPhoto(null); setUploading(false); setError("");
  };
  const choose = async (file: File) => {
    cancel(); setSaved(false); setProgress(0); setUploading(true);
    const controller = new AbortController(); abort.current = controller;
    try {
      const image = await uploadMedia(file, { purpose: "avatar", signal: controller.signal, onProgress: setProgress });
      pending.current = image; setPhoto(image);
    } catch(cause) { if (!(cause instanceof Error && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "Upload failed."); }
    finally { if (abort.current === controller) setUploading(false); }
  };
  const save = async (remove = false) => {
    if (saving) return;
    setSaving(true); setError(""); setSaved(false);
    // The profile request owns this asset while saving; navigation must not discard it.
    const selected = photo; pending.current = null;
    try {
      await updateProfile(remove ? null : selected?.id ?? null);
      if (remove && selected) void discardMedia(selected.id);
      setPhoto(null); setSaved(true);
    } catch(cause) { pending.current = selected; setError(cause instanceof Error ? cause.message : "Couldn't save your photo."); }
    finally { setSaving(false); }
  };
  const url = photo?.url || user?.avatarUrl;
  return <section aria-labelledby="profile-title" className="mx-auto w-full max-w-2xl">
    <header className="mb-6">
      <p className="text-xs font-medium text-muted">Settings</p>
      <h1 id="profile-title" className="mt-1 text-3xl font-semibold tracking-tight">Your profile</h1>
    </header>
    <Card className="overflow-hidden rounded-3xl border border-separator bg-surface shadow-none">
      <div className="flex flex-col items-center gap-4 px-5 py-7 text-center sm:flex-row sm:gap-6 sm:px-8 sm:py-8 sm:text-left">
        {url ? <ImagePreview key={url} src={url} alt="Your profile photo" title="Profile photo" label="View your profile photo" width={600} height={600} className="size-28 overflow-hidden rounded-full ring-4 ring-background">
          <Image src={url} width={224} height={224} alt="Your profile photo" className="size-full object-cover" />
        </ImagePreview> : <span className="grid size-28 shrink-0 place-items-center rounded-full bg-accent-soft text-3xl font-semibold text-accent-soft-foreground ring-4 ring-background">{(user?.name || "You").slice(0,1).toUpperCase()}</span>}
        <div className="min-w-0 max-w-full sm:flex-1">
          <h2 className="break-words text-xl font-semibold tracking-tight">{user?.name || "Music lover"}</h2>
          <p className="mt-1 text-sm text-muted [overflow-wrap:anywhere]">{user?.email || user?.phone}</p>
        </div>
      </div>
      <div className="border-t border-separator px-5 py-5 sm:px-8 sm:py-6">
        <h3 className="text-sm font-semibold">Profile photo</h3>
        <p className="mt-1 text-xs text-muted">Your photo in community chats.</p>
        <input ref={picker} type="file" accept={PHOTO_ACCEPT} aria-label="Choose profile photo" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void choose(file); }} />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button disabled={uploading || saving} onClick={() => picker.current?.click()} className="min-h-11 gap-2 rounded-xl px-4 text-sm"><Camera aria-hidden className="size-4" />{url ? "Change photo" : "Upload photo"}</Button>
          {!photo && user?.avatarUrl ? <Button variant="ghost" disabled={uploading || saving} loading={saving} onClick={() => void save(true)} className="min-h-11 gap-2 rounded-xl px-3 text-sm text-danger-soft-foreground">{!saving ? <Trash2 aria-hidden className="size-4" /> : null}{saving ? "Removing…" : "Remove photo"}</Button> : null}
        </div>
        {uploading ? <div className="mt-5 flex items-center gap-3"><ProgressBar aria-label="Profile upload progress" value={progress} maxValue={100} className="min-w-0 flex-1"><ProgressBar.Track className="h-1.5"><ProgressBar.Fill /></ProgressBar.Track></ProgressBar><span role="status" className="text-xs tabular-nums text-muted">{progress >= 95 ? "Finishing…" : `${progress}%`}</span><Button variant="ghost" size="icon" onClick={cancel} aria-label="Cancel photo upload" className="size-10 rounded-xl"><X aria-hidden className="size-4" /></Button></div> : null}
        {photo ? <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-separator pt-5"><Button onClick={() => void save()} loading={saving} className="min-h-11 gap-2 rounded-xl px-4 text-sm">{!saving ? <Check aria-hidden className="size-4" /> : null}{saving ? "Saving…" : "Save photo"}</Button><Button variant="ghost" disabled={saving} onClick={cancel} className="min-h-11 rounded-xl text-sm text-muted">Cancel</Button></div> : null}
        {error ? <p role="alert" className="mt-4 text-sm text-danger-soft-foreground">{error}</p> : null}
        {saved ? <p role="status" className="mt-4 flex items-center gap-2 text-sm text-brand"><Check aria-hidden className="size-4" />Profile updated.</p> : null}
      </div>
    </Card>
  </section>;
}
