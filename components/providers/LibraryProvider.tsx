"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Icon } from "@/components/ui/icons";
import { useAuth } from "@/components/providers/AuthProvider";
import { useMusicPlayer } from "@/components/providers/MusicPlayerProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { cn } from "@/lib/cn";
import {
  createServerPlaylist,
  deleteServerPlaylist,
  dropLike,
  dropPlaylistSong,
  fetchLibrary,
  saveLikes,
  savePlaylistSongs,
  type ServerLibrary,
} from "@/lib/library";
import type { Song } from "@/lib/saavn";

export interface Playlist {
  id: string;
  name: string;
  songs: Song[];
  createdAt: number;
}

interface LibraryState {
  liked: Song[];
  playlists: Playlist[];
}

interface LibraryContextValue {
  liked: Song[];
  playlists: Playlist[];
  isLiked: (song: Song) => boolean;
  toggleLike: (song: Song) => void;
  createPlaylist: (name: string) => string | null;
  addToPlaylist: (playlistId: string, song: Song) => void;
  removeFromPlaylist: (playlistId: string, songId: string) => void;
  deletePlaylist: (id: string) => void;
  playLiked: () => void;
  playPlaylist: (id: string) => void;
  openPicker: (song: Song) => void;
  closePicker: () => void;
}

const EMPTY: LibraryState = { liked: [], playlists: [] };
const MAX_PLAYLISTS = 30;
const MAX_NAME = 40;

const LibraryContext = createContext<LibraryContextValue | null>(null);

function storageKey(userId: string) {
  return `zyrava-library:${userId}`;
}

function readLibrary(userId: string): LibraryState {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const parsed = raw ? (JSON.parse(raw) as Partial<LibraryState>) : null;
    if (!parsed || typeof parsed !== "object") return EMPTY;
    return {
      liked: Array.isArray(parsed.liked) ? parsed.liked : [],
      playlists: Array.isArray(parsed.playlists) ? parsed.playlists : [],
    };
  } catch {
    return EMPTY;
  }
}

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `pl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The account's library, in the shape the app already works with. */
function fromServer(server: ServerLibrary): LibraryState {
  return {
    liked: server.liked ?? [],
    playlists: (server.playlists ?? []).map((playlist) => ({
      id: playlist.key,
      name: playlist.name,
      songs: playlist.songs ?? [],
      createdAt: Date.parse(playlist.createdAt) || 0,
    })),
  };
}

function hasNothing(library: LibraryState) {
  return !library.liked.length && !library.playlists.length;
}

/**
 * Lifts a library that only existed on this device onto the account. Oldest
 * rows go first so the server's own write order reads back the same way.
 */
async function uploadLibrary(local: LibraryState): Promise<void> {
  await saveLikes([...local.liked].reverse());
  for (const playlist of [...local.playlists].reverse()) {
    await createServerPlaylist(playlist.id, playlist.name);
    await savePlaylistSongs(playlist.id, playlist.songs);
  }
}

/**
 * The signed-in account's likes and playlists. They live in the database and
 * this device keeps a working copy of them for when the API cannot be reached.
 */
export function LibraryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { startQueue } = useMusicPlayer();
  const { success, toast } = useToast();

  const [state, setState] = useState<LibraryState>(EMPTY);
  const [pickerSong, setPickerSong] = useState<Song | null>(null);
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);
  const latest = useRef(state);

  useEffect(() => {
    latest.current = state;
  }, [state]);

  // Load (and reset) per account: the account's library is the copy of record,
  // this device's storage is the cache it falls back to when the API is down.
  useEffect(() => {
    const userId = user?.id ?? null;
    if (!userId) {
      loadedFor.current = null;
      const reset = requestAnimationFrame(() => {
        setState(EMPTY);
        setPickerSong(null);
      });
      return () => cancelAnimationFrame(reset);
    }

    let alive = true;
    void (async () => {
      const local = readLibrary(userId);
      let server: ServerLibrary | null = null;
      try {
        server = await fetchLibrary();
      } catch {
        server = null;
      }
      if (!alive) return;

      if (!server) {
        loadedFor.current = userId;
        setState(local);
        return;
      }

      const remote = fromServer(server);
      loadedFor.current = userId;
      if (hasNothing(remote) && !hasNothing(local)) {
        // A library from before this account existed here — carry it over.
        await uploadLibrary(local).catch(() => undefined);
        if (!alive) return;
        const lifted = await fetchLibrary().catch(() => null);
        if (!alive) return;
        setState(lifted ? fromServer(lifted) : local);
        return;
      }

      setState(remote);
    })();

    return () => {
      alive = false;
    };
  }, [user?.id]);

  // Persist once the correct account's library is in memory.
  useEffect(() => {
    if (!user || loadedFor.current !== user.id) return;
    try {
      window.localStorage.setItem(storageKey(user.id), JSON.stringify(state));
    } catch {
      /* storage can be unavailable in private mode */
    }
  }, [state, user]);

  /**
   * Changes the library at once, then writes it to the account; a write that
   * fails leaves the library exactly as it was and says so.
   */
  const commit = useCallback(
    (updater: (previous: LibraryState) => LibraryState, save: () => Promise<unknown>) => {
      const before = latest.current;
      setState((previous) => updater(previous));
      void save().catch((error: unknown) => {
        setState(before);
        toast({
          title: error instanceof Error ? error.message : "Could not reach your account.",
          description: "The change was not saved.",
          variant: "error",
        });
      });
    },
    [toast]
  );

  const isLiked = useCallback(
    (song: Song) => state.liked.some((entry) => entry.id === song.id),
    [state.liked]
  );

  const toggleLike = useCallback(
    (song: Song) => {
      const nowLiked = !state.liked.some((entry) => entry.id === song.id);
      commit(
        (previous) => {
          const exists = previous.liked.some((entry) => entry.id === song.id);
          return {
            ...previous,
            liked: exists
              ? previous.liked.filter((entry) => entry.id !== song.id)
              : [song, ...previous.liked],
          };
        },
        () => (nowLiked ? saveLikes([song]) : dropLike(song.id))
      );
      if (nowLiked) success("Added to Liked songs", song.title);
      else toast({ title: "Removed from Liked songs", description: song.title });
    },
    [commit, state.liked, success, toast]
  );

  const createPlaylist = useCallback(
    (rawName: string): string | null => {
      const name = rawName.trim().slice(0, MAX_NAME);
      if (!name) {
        setNameError("Give the playlist a name.");
        return null;
      }
      if (state.playlists.length >= MAX_PLAYLISTS) {
        setNameError("That is enough playlists for now.");
        return null;
      }
      if (state.playlists.some((playlist) => playlist.name.toLowerCase() === name.toLowerCase())) {
        setNameError("You already have a playlist with that name.");
        return null;
      }
      const playlist: Playlist = { id: newId(), name, songs: [], createdAt: Date.now() };
      commit(
        (previous) => ({ ...previous, playlists: [playlist, ...previous.playlists] }),
        () => createServerPlaylist(playlist.id, name)
      );
      setNameError(null);
      setNewName("");
      success("Playlist created", name);
      return playlist.id;
    },
    [commit, state.playlists, success]
  );

  const addToPlaylist = useCallback(
    (playlistId: string, song: Song) => {
      const target = state.playlists.find((playlist) => playlist.id === playlistId);
      if (!target) return;
      const already = target.songs.some((entry) => entry.id === song.id);
      if (already) {
        toast({ title: "Already in that playlist", description: song.title });
        return;
      }
      commit(
        (previous) => ({
          ...previous,
          playlists: previous.playlists.map((playlist) =>
            playlist.id === playlistId && !playlist.songs.some((entry) => entry.id === song.id)
              ? { ...playlist, songs: [...playlist.songs, song] }
              : playlist
          ),
        }),
        () => savePlaylistSongs(playlistId, [song])
      );
      success("Added to playlist", song.title);
    },
    [commit, state.playlists, success, toast]
  );

  const removeFromPlaylist = useCallback(
    (playlistId: string, songId: string) => {
      commit(
        (previous) => ({
          ...previous,
          playlists: previous.playlists.map((playlist) =>
            playlist.id === playlistId
              ? { ...playlist, songs: playlist.songs.filter((song) => song.id !== songId) }
              : playlist
          ),
        }),
        () => dropPlaylistSong(playlistId, songId)
      );
    },
    [commit]
  );

  const deletePlaylist = useCallback(
    (id: string) => {
      commit(
        (previous) => ({
          ...previous,
          playlists: previous.playlists.filter((playlist) => playlist.id !== id),
        }),
        () => deleteServerPlaylist(id)
      );
      toast({ title: "Playlist deleted" });
    },
    [commit, toast]
  );

  const playLiked = useCallback(() => {
    if (!state.liked.length) {
      toast({ title: "Nothing liked yet", description: "Tap the heart on any song." });
      return;
    }
    startQueue(state.liked, "Liked songs", 0);
  }, [state.liked, startQueue, toast]);

  const playPlaylist = useCallback(
    (id: string) => {
      const playlist = state.playlists.find((entry) => entry.id === id);
      if (!playlist?.songs.length) {
        toast({ title: "This playlist is empty", description: "Add a song with the + button." });
        return;
      }
      startQueue(playlist.songs, playlist.name, 0);
    },
    [state.playlists, startQueue, toast]
  );

  const openPicker = useCallback((song: Song) => {
    setPickerSong(song);
    setNameError(null);
    setNewName("");
  }, []);

  const closePicker = useCallback(() => setPickerSong(null), []);

  const submitPlaylist = (event: FormEvent) => {
    event.preventDefault();
    if (!pickerSong) return;
    const name = newName.trim().slice(0, MAX_NAME);
    if (!name) {
      setNameError("Give the playlist a name.");
      return;
    }
    if (state.playlists.some((playlist) => playlist.name.toLowerCase() === name.toLowerCase())) {
      setNameError("You already have a playlist with that name.");
      return;
    }
    if (state.playlists.length >= MAX_PLAYLISTS) {
      setNameError("That is enough playlists for now.");
      return;
    }

    // Create the playlist and drop the song in with one state change.
    const playlist: Playlist = {
      id: newId(),
      name,
      songs: [pickerSong],
      createdAt: Date.now(),
    };
    commit(
      (previous) => ({ ...previous, playlists: [playlist, ...previous.playlists] }),
      async () => {
        await createServerPlaylist(playlist.id, name);
        await savePlaylistSongs(playlist.id, [pickerSong]);
      }
    );
    success("Playlist created", `${name} · ${pickerSong.title}`);
    setNewName("");
    setNameError(null);
    setPickerSong(null);
  };

  return (
    <LibraryContext.Provider
      value={{
        liked: state.liked,
        playlists: state.playlists,
        isLiked,
        toggleLike,
        createPlaylist,
        addToPlaylist,
        removeFromPlaylist,
        deletePlaylist,
        playLiked,
        playPlaylist,
        openPicker,
        closePicker,
      }}
    >
      {children}

      {pickerSong ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add to playlist"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={closePicker}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-separator bg-surface p-4 shadow-pop"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Add to playlist</p>
                <p className="truncate pt-0.5 text-xs text-muted">
                  {pickerSong.title} · {pickerSong.artist}
                </p>
              </div>
              <button
                type="button"
                onClick={closePicker}
                aria-label="Close"
                className="grid size-8 flex-none place-items-center rounded-lg text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
              >
                <Icon name="x" className="size-4" />
              </button>
            </div>

            <div className="mt-3 max-h-56 overflow-y-auto">
              {state.playlists.map((playlist) => {
                const has = playlist.songs.some((song) => song.id === pickerSong.id);
                return (
                  <button
                    key={playlist.id}
                    type="button"
                    disabled={has}
                    onClick={() => {
                      addToPlaylist(playlist.id, pickerSong);
                      setPickerSong(null);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start text-xs transition-colors",
                      has
                        ? "text-faint-foreground"
                        : "text-foreground hover:bg-surface-secondary"
                    )}
                  >
                    <Icon name="list" className="size-4 flex-none text-muted" />
                    <span className="min-w-0 flex-1 truncate">{playlist.name}</span>
                    <span className="flex-none text-[10px] text-faint-foreground">
                      {has ? "Added" : `${playlist.songs.length}`}
                    </span>
                  </button>
                );
              })}
              {!state.playlists.length ? (
                <p className="px-2 py-3 text-xs text-muted">
                  No playlists yet — name one below and it is created with this song.
                </p>
              ) : null}
            </div>

            <form onSubmit={submitPlaylist} className="mt-3 flex gap-1.5">
              <input
                value={newName}
                onChange={(event) => {
                  setNewName(event.target.value);
                  setNameError(null);
                }}
                maxLength={MAX_NAME}
                placeholder="New playlist name"
                aria-label="New playlist name"
                className="compact-select h-9 min-w-0 flex-1 rounded-lg border border-separator bg-surface-secondary/50 px-2.5 text-foreground placeholder:text-faint-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
              />
              <button
                type="submit"
                className="h-9 flex-none rounded-lg bg-accent px-3 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
              >
                Create
              </button>
            </form>
            {nameError ? <p className="pt-1.5 text-[11px] text-danger-soft-foreground">{nameError}</p> : null}
          </div>
        </div>
      ) : null}
    </LibraryContext.Provider>
  );
}

export function useLibrary(): LibraryContextValue {
  const context = useContext(LibraryContext);
  if (!context) throw new Error("useLibrary must be used inside LibraryProvider");
  return context;
}
