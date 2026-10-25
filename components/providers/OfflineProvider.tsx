"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { useTaste } from "@/components/providers/TasteProvider";
import {
  IMPORT_LIMITS,
  collectAudioFiles,
  deleteTrack,
  deriveName,
  extensionFor,
  getBlob,
  hasTrack,
  isAudioFileName,
  listTracks,
  localIdFor,
  pickerWindow,
  putTrack,
  readDuration,
  roomFor,
  type OfflineTrack,
} from "@/lib/offline";
import type { Song } from "@/lib/saavn";

interface SaveProgress {
  loaded: number;
  total: number;
}

interface ImportProgress {
  done: number;
  total: number;
}

interface OfflineValue {
  downloads: OfflineTrack[];
  locals: OfflineTrack[];
  ready: boolean;
  /** Whether this browser can hand back a whole folder. */
  canPickFolder: boolean;
  savedIds: Set<string>;
  progress: Record<string, SaveProgress>;
  /** How far through a bulk save we are, beyond the one song in `progress`. */
  saving: ImportProgress | null;
  importing: ImportProgress | null;
  save: (song: Song) => Promise<void>;
  saveAll: (songs: Song[]) => Promise<void>;
  removeSaved: (id: string) => Promise<void>;
  removeLocal: (id: string) => Promise<void>;
  /** Writes a copy the user can keep outside the app. */
  exportCopy: (id: string) => Promise<void>;
  importFolder: () => Promise<void>;
  importFiles: (files: FileList) => Promise<void>;
  /** Object URL for device-local audio, or null when the copy is gone. */
  openPlaybackUrl: (id: string) => Promise<string | null>;
}

const OfflineContext = createContext<OfflineValue | null>(null);

const NOT_SAVABLE = "This song can't be saved on this device.";
const NO_ROOM = "There isn't enough room left on this device.";

/** A link click is the export path every browser has. */
function saveViaAnchor(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoking on the same tick can cancel the hand-off, so give it a moment.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Saved copies and imported files, held on this device. */
export function OfflineProvider({ children }: { children: ReactNode }) {
  const { toast, success, error } = useToast();

  const [downloads, setDownloads] = useState<OfflineTrack[]>([]);
  const [locals, setLocals] = useState<OfflineTrack[]>([]);
  const [ready, setReady] = useState(false);
  const [canPickFolder, setCanPickFolder] = useState(false);
  const [progress, setProgress] = useState<Record<string, SaveProgress>>({});
  const [saving, setSaving] = useState<ImportProgress | null>(null);
  const [importing, setImporting] = useState<ImportProgress | null>(null);

  const savesRef = useRef(new Map<string, AbortController>());
  /** One `<audio>` means one live object URL is all there is to track. */
  const slotRef = useRef<{ id: string; url: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setCanPickFolder("showDirectoryPicker" in window);
      try {
        const [saved, own] = await Promise.all([listTracks("download"), listTracks("local")]);
        if (!alive) return;
        setDownloads(saved);
        setLocals(own);
      } catch {
        /* A blocked store leaves the tabs empty rather than broken. */
      }
      if (alive) setReady(true);
      // An app that plays back saved audio should not be the first thing evicted.
      if (navigator.storage?.persist) void navigator.storage.persist().catch(() => undefined);
    })();
    return () => {
      alive = false;
      const slot = slotRef.current;
      if (slot) URL.revokeObjectURL(slot.url);
      slotRef.current = null;
    };
  }, []);

  const savedIds = useMemo(() => new Set(downloads.map((track) => track.id)), [downloads]);

  const markProgress = useCallback((id: string, value: SaveProgress | null) => {
    setProgress((previous) => {
      if (!value) {
        if (!(id in previous)) return previous;
        const next = { ...previous };
        delete next[id];
        return next;
      }
      return { ...previous, [id]: value };
    });
  }, []);

  /** Reads the whole body through a reader so a row can show how far it got. */
  const readBody = useCallback(
    async (response: Response, id: string): Promise<Blob> => {
      const total = Number(response.headers.get("content-length")) || 0;
      if (!response.body) return response.blob();

      // Aborting the request errors the body stream, so the read below rejects.
      const reader = response.body.getReader();
      const chunks: BlobPart[] = [];
      let loaded = 0;
      let painted = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        const now = Date.now();
        if (now - painted > 150) {
          painted = now;
          markProgress(id, { loaded, total });
        }
      }
      const mime = response.headers.get("content-type")?.split(";")[0] || "audio/mp4";
      return new Blob(chunks, { type: mime });
    },
    [markProgress]
  );

  /**
   * Streams one catalogue song onto the device. `quiet` keeps a bulk run from
   * raising a toast per track — the caller summarises instead.
   */
  const { record } = useTaste();

  const saveOne = useCallback(
    async (song: Song, quiet: boolean): Promise<"saved" | "skipped" | "failed"> => {
      if (!song.streamUrl || savesRef.current.has(song.id)) return "skipped";
      if (await hasTrack(song.id)) {
        if (!quiet) toast({ title: "Already on this device", description: song.title });
        return "skipped";
      }

      const controller = new AbortController();
      savesRef.current.set(song.id, controller);
      markProgress(song.id, { loaded: 0, total: 0 });
      try {
        const response = await fetch(song.streamUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(NOT_SAVABLE);
        const blob = await readBody(response, song.id);
        if (!blob.size) throw new Error(NOT_SAVABLE);
        if (!(await roomFor(blob.size))) throw new Error(NO_ROOM);

        const mime = blob.type || "audio/mp4";
        const ext = extensionFor(mime, "");
        const track: OfflineTrack = {
          id: song.id,
          kind: "download",
          title: song.title,
          artist: song.artist,
          album: song.album,
          image: song.image,
          imageLarge: song.imageLarge,
          duration: song.duration,
          bytes: blob.size,
          mime,
          fileName: `${song.artist} - ${song.title}`.replace(/[\\/:*?"<>|]/g, "") + `.${ext}`,
          addedAt: Date.now(),
        };
        await putTrack(track, blob);
        setDownloads(await listTracks("download"));
        if (!quiet) success("Saved on this device", `${track.title} · ${track.artist}`);
        record("save", song, { pct: 1 });
      return "saved";
      } catch (caught: unknown) {
        if (controller.signal.aborted) return "skipped";
        const message = caught instanceof Error && caught.message === NO_ROOM ? NO_ROOM : NOT_SAVABLE;
        if (!quiet) error(message, song.title);
        return "failed";
      } finally {
        savesRef.current.delete(song.id);
        markProgress(song.id, null);
      }
    },
    [error, markProgress, readBody, record, success, toast]
  );

  const save = useCallback(
    async (song: Song) => {
      await saveOne(song, false);
    },
    [saveOne]
  );

  /** One at a time: this shares the network with whatever is already playing. */
  const saveAll = useCallback(
    async (songs: Song[]) => {
      const pending = songs.filter((song) => song.streamUrl && !savedIds.has(song.id));
      if (!pending.length) {
        toast({ title: "Already on this device", description: "Every song here is saved." });
        return;
      }
      let savedCount = 0;
      let failed = 0;
      setSaving({ done: 0, total: pending.length });
      for (let i = 0; i < pending.length; i += 1) {
        const outcome = await saveOne(pending[i], true);
        setSaving({ done: i + 1, total: pending.length });
        if (outcome === "saved") savedCount += 1;
        if (outcome === "failed") failed += 1;
      }
      setSaving(null);
      const tail = failed ? ` · ${failed} couldn't be saved` : "";
      if (savedCount) {
        success("Saved on this device", `${savedCount} ${savedCount === 1 ? "song" : "songs"}${tail}`);
      } else {
        error(NOT_SAVABLE, `${pending.length} songs`);
      }
    },
    [error, saveOne, savedIds, success, toast]
  );

  const removeSaved = useCallback(
    async (id: string) => {
      savesRef.current.get(id)?.abort();
      savesRef.current.delete(id);
      markProgress(id, null);
      await deleteTrack(id);
      setDownloads(await listTracks("download"));
    },
    [markProgress]
  );

  const removeLocal = useCallback(async (id: string) => {
    await deleteTrack(id);
    setLocals(await listTracks("local"));
  }, []);

  const exportCopy = useCallback(
    async (id: string) => {
      const track =
        downloads.find((entry) => entry.id === id) ?? locals.find((entry) => entry.id === id);
      const blob = await getBlob(id);
      if (!track || !blob) {
        error("This saved copy is no longer on this device.");
        return;
      }
      const ext = extensionFor(track.mime, track.fileName);
      const name = `${track.fileName.replace(/\.[^.]+$/i, "")}.${ext}`;
      const picker = pickerWindow().showSaveFilePicker;
      if (picker) {
        try {
          const handle = await picker({
            suggestedName: name,
            types: [{ description: "Audio", accept: { [track.mime]: [`.${ext}`] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          success("Copy written", name);
          return;
        } catch (caught: unknown) {
          if (caught instanceof DOMException && caught.name === "AbortError") return;
          // Any other picker failure still owes the user their file.
        }
      }
      saveViaAnchor(blob, name);
      success("Export started", name);
    },
    [downloads, error, locals, success]
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      const capped = files
        .filter((file) => isAudioFileName(file.name) && file.size <= IMPORT_LIMITS.maxBytes)
        .slice(0, IMPORT_LIMITS.maxFiles);
      if (!capped.length) {
        toast({
          title: "No songs found there",
          description: "Pick a folder that holds audio files.",
        });
        return;
      }

      setImporting({ done: 0, total: capped.length });
      let added = 0;
      let already = 0;
      let failed = 0;
      for (let i = 0; i < capped.length; i += 1) {
        const file = capped[i];
        setImporting({ done: i, total: capped.length });
        try {
          const id = await localIdFor(file);
          if (await hasTrack(id)) {
            already += 1;
            continue;
          }
          if (!(await roomFor(file.size))) {
            error(NO_ROOM, `${added} of ${capped.length} were added`);
            break;
          }
          const { title, artist } = deriveName(file);
          const track: OfflineTrack = {
            id,
            kind: "local",
            title,
            artist,
            album: "",
            image: "",
            imageLarge: "",
            duration: await readDuration(file),
            bytes: file.size,
            mime: file.type || "audio/mp4",
            fileName: file.name,
            addedAt: Date.now(),
          };
          // The File itself is cloneable, so storing it costs no extra bytes.
          await putTrack(track, file);
          added += 1;
        } catch {
          failed += 1;
        }
      }
      setImporting(null);
      setLocals(await listTracks("local"));

      const notes = [already ? `${already} already added` : "", failed ? `${failed} unreadable` : ""]
        .filter(Boolean)
        .join(" · ");
      if (added) {
        success("Added your songs", `${added} ${added === 1 ? "song" : "songs"}${notes ? ` · ${notes}` : ""}`);
      } else if (already) {
        toast({ title: "Nothing new to add", description: `${already} already imported.` });
      } else {
        error("Those files couldn't be read", notes || undefined);
      }
    },
    [error, success, toast]
  );

  const importFolder = useCallback(async () => {
    const picker = pickerWindow().showDirectoryPicker;
    if (!picker) return;
    setImporting({ done: 0, total: 0 });
    try {
      // The same id lets Chromium remember this folder after one click.
      const root = await picker({ id: "zyrava-songs", mode: "read" });
      const files = await collectAudioFiles(root, IMPORT_LIMITS.maxFiles);
      await addFiles(files);
    } catch (caught: unknown) {
      setImporting(null);
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      error("That folder couldn't be read", "Try choosing the files themselves instead.");
    }
  }, [addFiles, error]);

  const importFiles = useCallback(
    async (list: FileList) => {
      await addFiles(Array.from(list));
    },
    [addFiles]
  );

  const openPlaybackUrl = useCallback(async (id: string) => {
    const blob = await getBlob(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    const previous = slotRef.current;
    slotRef.current = { id, url };
    // Created before the old one is dropped, so a switch never binds a dead URL.
    if (previous) URL.revokeObjectURL(previous.url);
    return url;
  }, []);

  const value = useMemo<OfflineValue>(
    () => ({
      downloads,
      locals,
      ready,
      canPickFolder,
      savedIds,
      progress,
      saving,
      importing,
      save,
      saveAll,
      removeSaved,
      removeLocal,
      exportCopy,
      importFolder,
      importFiles,
      openPlaybackUrl,
    }),
    [
      downloads,
      locals,
      ready,
      canPickFolder,
      savedIds,
      progress,
      saving,
      importing,
      save,
      saveAll,
      removeSaved,
      removeLocal,
      exportCopy,
      importFolder,
      importFiles,
      openPlaybackUrl,
    ]
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineValue {
  const context = useContext(OfflineContext);
  if (!context) throw new Error("useOffline must be used within OfflineProvider");
  return context;
}
