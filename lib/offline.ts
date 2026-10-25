/**
 * Device-local audio: saved copies of catalogue songs and files the user
 * imports from their own folders.
 *
 * Two stores are kept apart on purpose — metadata rows that a list can render
 * without touching a byte of audio, and the blobs behind them. Reading every
 * blob to paint a list would take a phone down.
 */

import type { OfflineSource, Song } from "@/lib/saavn";

export type OfflineKind = OfflineSource;

export interface OfflineTrack {
  id: string;
  kind: OfflineKind;
  title: string;
  artist: string;
  album: string;
  image: string;
  imageLarge: string;
  /** Seconds; 0 when the container never told us. */
  duration: number;
  bytes: number;
  mime: string;
  fileName: string;
  addedAt: number;
}

const DB_NAME = "zyrava-offline";
const TRACKS = "tracks";
const BLOBS = "blobs";

/** Extensions worth offering to the decoder — everything else is skipped. */
const AUDIO_FILE = /\.(m4a|m4b|mp3|mp4|aac|ogg|oga|opus|flac|wav|weba|webm)$/i;

const MAX_IMPORT_FILES = 400;
const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
/** Writes stop short of the ceiling so the browser never evicts us outright. */
const QUOTA_HEADROOM = 0.9;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(TRACKS)) {
          const tracks = db.createObjectStore(TRACKS, { keyPath: "id" });
          tracks.createIndex("by-kind", "kind");
        }
        if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error: unknown) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

function tx(db: IDBDatabase, stores: string[], mode: IDBTransactionMode) {
  return db.transaction(stores, mode);
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/** Rows for one kind, newest first — metadata only, so this stays cheap. */
export async function listTracks(kind: OfflineKind): Promise<OfflineTrack[]> {
  const db = await openDb();
  const index = tx(db, [TRACKS], "readonly").objectStore(TRACKS).index("by-kind");
  const rows = await done<OfflineTrack[]>(index.getAll(kind) as IDBRequest<OfflineTrack[]>);
  return rows.sort((a, b) => b.addedAt - a.addedAt);
}

/** One transaction for the row and its audio, so the two can never disagree. */
export async function putTrack(track: OfflineTrack, blob: Blob | File): Promise<void> {
  const db = await openDb();
  const transaction = tx(db, [TRACKS, BLOBS], "readwrite");
  transaction.objectStore(TRACKS).put(track);
  transaction.objectStore(BLOBS).put(blob, track.id);
  await complete(transaction);
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  const db = await openDb();
  return done(tx(db, [BLOBS], "readonly").objectStore(BLOBS).get(id));
}

/** The "is this already on the device" check — keyed lookup, no blob read. */
export async function hasTrack(id: string): Promise<boolean> {
  const db = await openDb();
  const key = await done(tx(db, [TRACKS], "readonly").objectStore(TRACKS).getKey(id));
  return key !== undefined;
}

export async function deleteTrack(id: string): Promise<void> {
  const db = await openDb();
  const transaction = tx(db, [TRACKS, BLOBS], "readwrite");
  transaction.objectStore(TRACKS).delete(id);
  transaction.objectStore(BLOBS).delete(id);
  await complete(transaction);
}

export async function getQuota(): Promise<{ usage: number; quota: number }> {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0 };
  const estimate = await navigator.storage.estimate();
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
}

/** True when the write would push past the headroom the browser leaves us. */
export async function roomFor(bytes: number): Promise<boolean> {
  const { usage, quota } = await getQuota();
  if (!quota) return true;
  return usage + bytes <= quota * QUOTA_HEADROOM;
}

/* ── the picking surface ──
 * TypeScript's DOM lib types `FileSystemDirectoryHandle` but not the entry
 * iterator or the two pickers, so the shape used here is declared rather than
 * cast at every call site.
 */

export type DirectoryEntry =
  | { readonly kind: "file"; readonly name: string; getFile(): Promise<File> }
  | {
      readonly kind: "directory";
      readonly name: string;
      values(): AsyncIterable<DirectoryEntry>;
    };

export interface PickableDirectory {
  values(): AsyncIterable<DirectoryEntry>;
}

interface PickerWindow {
  showDirectoryPicker?: (options: {
    id?: string;
    mode?: "read" | "readwrite";
  }) => Promise<PickableDirectory & { name: string }>;
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }>;
}

export function pickerWindow(): PickerWindow {
  return window as unknown as PickerWindow;
}

/** Depth-bounded walk: a stray mount point or sync root must not hang the app. */
export async function collectAudioFiles(
  root: PickableDirectory,
  limit: number
): Promise<File[]> {
  const found: File[] = [];
  const stack: Array<{ dir: PickableDirectory; depth: number }> = [{ dir: root, depth: 0 }];
  while (stack.length && found.length < limit) {
    const { dir, depth } = stack.pop()!;
    for await (const entry of dir.values()) {
      if (found.length >= limit) break;
      if (entry.kind === "directory") {
        if (depth < 4) stack.push({ dir: entry, depth: depth + 1 });
      } else if (isAudioFileName(entry.name)) {
        found.push(await entry.getFile());
      }
    }
  }
  return found;
}

/* ── helpers ── */

export function isAudioFileName(name: string): boolean {
  return AUDIO_FILE.test(name);
}

export const IMPORT_LIMITS = { maxFiles: MAX_IMPORT_FILES, maxBytes: MAX_IMPORT_BYTES };

/** A name the user can keep: prefer the file's own tail, then the container. */
export function extensionFor(mime: string, fileName: string): string {
  const fromName = /\.([a-z0-9]+)$/i.exec(fileName)?.[1];
  if (fromName) return fromName;
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("flac")) return "flac";
  if (mime.includes("weba") || mime.includes("webm")) return "weba";
  return "m4a";
}

/**
 * A fingerprint that identifies the same file across imports. `crypto.subtle`
 * only exists in a secure context, so a plain hash covers a dev server reached
 * over the local network.
 */
export async function localIdFor(file: File): Promise<string> {
  const seed = `${file.size}:${file.lastModified}:${file.name}`;
  if (crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
    const hex = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    return `local:${hex.slice(0, 24)}`;
  }
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `local:${(hash >>> 0).toString(36).padStart(7, "0")}`;
}

/** `03. Artist - Title.m4a` reads as a track; anything else keeps its name. */
export function deriveName(file: File): { title: string; artist: string } {
  const base = file.name.replace(/\.[^.]+$/, "").replace(/^\s*\d{1,3}[-_.]\s*/, "");
  const split = base.split(/\s+[-–—]\s+/);
  if (split.length >= 2) {
    const artist = split[0].trim();
    const title = split.slice(1).join(" - ").trim();
    if (artist && title) return { title, artist };
  }
  return { title: base.trim() || file.name, artist: "Local files" };
}

/** `fileFromTrack` gives a saved copy the shape the rest of the app plays. */
export function toSong(track: OfflineTrack): Song {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    year: "",
    language: "",
    duration: track.duration,
    image: track.image,
    imageLarge: track.imageLarge,
    // Ignored whenever `offline` is set; kept so no consumer reads undefined.
    streamUrl: "",
    pageUrl: "",
    offline: { kind: track.kind, id: track.id },
  };
}

/**
 * Ask a detached element how long the container says it is. Resolves 0 rather
 * than rejecting: an undecodable file has already been refused elsewhere.
 */
export function readDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const probe = document.createElement("audio");
    const url = URL.createObjectURL(blob);
    let settled = false;
    const finish = (value: number) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      probe.removeAttribute("src");
      resolve(value);
    };
    probe.preload = "metadata";
    probe.onloadedmetadata = () =>
      finish(Number.isFinite(probe.duration) ? Math.round(probe.duration) : 0);
    probe.onerror = () => finish(0);
    window.setTimeout(() => finish(0), 6000);
    probe.src = url;
  });
}
