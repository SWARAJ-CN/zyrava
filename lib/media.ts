"use client";
import { apiFetch } from "./api";

export type MediaKind = "image" | "video" | "audio";
export interface MediaAttachment { id: string; kind: MediaKind; url: string; name: string; width: number; height: number; bytes: number; duration: number }
export const MEDIA_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/avif,video/mp4,video/quicktime,video/webm,video/x-matroska,audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/x-wav,audio/ogg,audio/flac,audio/webm";
export const AUDIO_ACCEPT = MEDIA_ACCEPT.split(",").filter(type => type.startsWith("audio/")).join(",");
export const VIDEO_ACCEPT = MEDIA_ACCEPT.split(",").filter(type => type.startsWith("video/")).join(",");
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/avif";
export function fileKind(file: File): MediaKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  throw new Error("Choose an image, video, or audio file.");
}
export function validateFile(file: File, avatar = false) {
  const kind = fileKind(file);
  const allowed = (avatar ? PHOTO_ACCEPT : MEDIA_ACCEPT).split(",");
  if (!allowed.includes(file.type)) throw new Error(avatar ? "Choose a JPG, PNG, WebP, GIF, HEIC, or AVIF image." : "This file format is not supported. Try JPG, PNG, MP4, MP3, or M4A.");
  const limit = avatar ? 5 : 100;
  const maxBytes = avatar ? 5 * 1024 ** 2 : 100_000_000;
  if (!file.size || file.size > maxBytes) throw new Error(`Choose a file between 1 byte and ${limit} MB.`);
  return kind;
}
/** Cloudinary's current image allowance is 10 MiB. Keep large still photos
 * within it without uploading the original or changing animated files. */
async function prepareChatFile(file: File, signal: AbortSignal): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= 10 * 1024 ** 2) return file;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("This image exceeds the storage account's 10 MB limit. Choose a smaller image; audio and video support 100 MB.");
  const header = new TextDecoder("latin1").decode(await file.slice(0, 256 * 1024).arrayBuffer());
  if (header.includes("ANIM") || header.includes("acTL")) throw new Error("Animated images must be under 10 MB on this storage account. Please choose a smaller animation.");
  if (signal.aborted) throw new DOMException("Upload canceled", "AbortError");
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Couldn't prepare this image. Please choose a smaller photo.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.88));
    if (signal.aborted) throw new DOMException("Upload canceled", "AbortError");
    if (!blob || blob.size > 10 * 1024 ** 2) throw new Error("Couldn't fit this photo within the storage limit. Please choose a smaller photo.");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + (blob.type === "image/webp" ? ".webp" : ".png"), { type: blob.type });
  } finally { bitmap.close(); }
}

export const discardMedia = (uploadId: string) => apiFetch("/api/media/discard", { method: "POST", body: { uploadId } }).catch(() => undefined);

export async function uploadMedia(file: File, options: { purpose: "chat" | "avatar"; conversation?: string; signal: AbortSignal; onProgress: (value: number) => void }): Promise<MediaAttachment> {
  const kind = validateFile(file, options.purpose === "avatar");
  let uploadId: string | undefined;
  try {
    if (options.signal.aborted) throw new DOMException("Upload canceled", "AbortError");
    if (options.purpose === "chat") file = await prepareChatFile(file, options.signal);
    const grant = await apiFetch<{ uploadId: string; url: string; fields: Record<string, string | number | boolean> }>("/api/media/sign", { method: "POST", body: {
      purpose: options.purpose, kind, conversation: options.conversation, name: file.name.slice(0, 120), size: file.size,
    } });
    uploadId = grant.uploadId;
    if (options.signal.aborted) throw new DOMException("Upload canceled", "AbortError");
    const data = new FormData();
    Object.entries(grant.fields).forEach(([key,value]) => data.append(key, String(value)));
    data.append("file", file);
    await new Promise<void>((resolve,reject) => {
      const xhr = new XMLHttpRequest();
      const abort = () => xhr.abort();
      options.signal.addEventListener("abort", abort, { once: true });
      xhr.open("POST", grant.url); xhr.timeout = 600000;
      xhr.upload.onprogress = event => { if (event.lengthComputable) options.onProgress(Math.min(95, Math.round(event.loaded / event.total * 95))); };
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Cloudinary couldn't upload this file. Check the file size and format, then try again."));
      xhr.onerror = () => reject(new Error("Upload interrupted. Check your connection and try again."));
      xhr.ontimeout = () => reject(new Error("Upload timed out. Try a smaller file or a faster connection."));
      xhr.onabort = () => reject(new DOMException("Upload canceled", "AbortError"));
      xhr.onloadend = () => options.signal.removeEventListener("abort", abort);
      xhr.send(data);
    });
    if (options.signal.aborted) throw new DOMException("Upload canceled", "AbortError");
    const result = await apiFetch<{ attachment: MediaAttachment }>("/api/media/complete", { method: "POST", body: { uploadId } });
    if (options.signal.aborted) throw new DOMException("Upload canceled", "AbortError");
    options.onProgress(100);
    return result.attachment;
  } catch(error) {
    if (uploadId) void discardMedia(uploadId);
    throw error;
  }
}
