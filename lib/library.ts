"use client";

import { apiFetch } from "@/lib/api";
import type { Song } from "@/lib/saavn";

/**
 * The account server's library endpoints. Every call is scoped to the signed-in
 * account by its access token, so no user id is ever sent.
 */

/** One list as the account server stores it. */
export interface ServerPlaylist {
  key: string;
  name: string;
  songs: Song[];
  /** ISO timestamp from the database. */
  createdAt: string;
}

export interface ServerLibrary {
  liked: Song[];
  playlists: ServerPlaylist[];
}

/** Tracks per request: the ceiling the API accepts in one body. */
const CHUNK = 15;

export function fetchLibrary(): Promise<ServerLibrary> {
  return apiFetch<ServerLibrary>("/api/library");
}

function chunks(songs: Song[]): Song[][] {
  const out: Song[][] = [];
  for (let index = 0; index < songs.length; index += CHUNK) {
    out.push(songs.slice(index, index + CHUNK));
  }
  return out;
}

/**
 * Saves liked tracks, oldest first when more than one — the server orders the
 * list by the moment each row was written.
 */
export async function saveLikes(songs: Song[]): Promise<void> {
  for (const group of chunks(songs)) {
    await apiFetch("/api/library/likes", { method: "POST", body: { songs: group } });
  }
}

export function dropLike(songId: string): Promise<void> {
  return apiFetch<void>("/api/library/unlike", { method: "POST", body: { songId } });
}

export function createServerPlaylist(key: string, name: string): Promise<unknown> {
  return apiFetch("/api/library/playlist", { method: "POST", body: { key, name } });
}

export function deleteServerPlaylist(key: string): Promise<void> {
  return apiFetch<void>("/api/library/playlist/delete", { method: "POST", body: { key } });
}

/** Appends tracks in the order given, skipping the ones already in the list. */
export async function savePlaylistSongs(key: string, songs: Song[]): Promise<void> {
  for (const group of chunks(songs)) {
    await apiFetch("/api/library/playlist/songs", { method: "POST", body: { key, songs: group } });
  }
}

export function dropPlaylistSong(key: string, songId: string): Promise<unknown> {
  return apiFetch("/api/library/playlist/song/remove", {
    method: "POST",
    body: { key, songId },
  });
}
