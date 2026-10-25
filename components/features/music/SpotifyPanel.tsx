"use client";

/**
 * Spotify library panel — connect button, profile, Liked Songs and playlists
 * (private + collaborative), with real pagination against the app's proxy
 * routes. Nothing here touches Spotify directly; tokens stay in httpOnly
 * cookies and every call goes through /api/spotify/*.
 */
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { EmptyState, Notice, Skeleton, Spinner } from "@/components/ui/Feedback";
import { Pagination } from "@/components/ui/Controls";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { Paged, SpotifyPlaylist, SpotifyTrack } from "@/lib/spotify/library";

/** Spotify's brand mark, drawn inline — Feather has no brand glyphs. */
function SpotifyMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.5 17.31a.75.75 0 0 1-1.03.25c-2.82-1.72-6.37-2.11-10.56-1.16a.75.75 0 1 1-.33-1.46c4.58-1.05 8.51-.6 11.68 1.34.35.22.46.68.24 1.03zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.23-1.98-8.15-2.56-11.97-1.4a.94.94 0 0 1-.54-1.79c4.36-1.32 9.78-.68 13.49 1.6.44.27.58.85.31 1.28zm.13-3.4C15.24 8.35 8.85 8.14 5.16 9.25a1.12 1.12 0 0 1-.65-2.15c4.24-1.28 11.28-1.03 15.72 1.6a1.12 1.12 0 0 1-1.13 1.93z" />
    </svg>
  );
}

const PAGE_SIZE = 24;

type Profile = { id: string; name: string; avatar: string | null; profileUrl: string };
type PlaylistTracks = { playlist: SpotifyPlaylist; tracks: Paged<SpotifyTrack> };

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const ERROR_TEXT: Record<string, string> = {
  missing_client_id: "The Spotify client id is missing — add SPOTIFY_CLIENT_ID to .env and restart.",
  access_denied: "Spotify authorization was declined. Nothing was connected.",
  provider_error: "Spotify returned an error during authorization. Try again.",
  incomplete_callback: "The Spotify callback was missing its code or state — try connecting again.",
  session_expired: "The authorization session timed out — press Continue with Spotify once more.",
  state_mismatch: "Security check failed (state mismatch) — try connecting again.",
  token_exchange: "The token exchange with Spotify failed — verify the redirect URI in your dashboard.",
  unauthorized: "Your Spotify session expired — reconnect to continue.",
  rate_limited: "Spotify is rate limiting the app — wait a few seconds and retry.",
  playlist_not_found: "That playlist isn't visible to this account.",
  tracks_unavailable: "Spotify doesn't expose this playlist's tracks to the app.",
  spotify_error: "Spotify returned an unexpected error — try again.",
  profile_unavailable: "Couldn't load your Spotify profile.",
};

export function SpotifyPanel({ className }: { className?: string }) {
  const [status, setStatus] = useState<"loading" | "anonymous" | "connected">("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [tab, setTab] = useState<"liked" | "playlists">("liked");
  const [liked, setLiked] = useState<Paged<SpotifyTrack> | null>(null);
  const [likedPage, setLikedPage] = useState(0);
  const [playlists, setPlaylists] = useState<Paged<SpotifyPlaylist> | null>(null);
  const [playlistPage, setPlaylistPage] = useState(0);
  const [openPlaylist, setOpenPlaylist] = useState<PlaylistTracks | null>(null);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    try {
      const response = await fetch("/api/spotify/me", { cache: "no-store" });
      const data = (await response.json()) as { connected: boolean; profile?: Profile };
      if (data.connected && data.profile) {
        setProfile(data.profile);
        setStatus("connected");
      } else {
        setStatus("anonymous");
      }
    } catch {
      setStatus("anonymous");
    }
  }, []);

  // Surface the OAuth result banner + clean the URL afterwards.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("spotify");
    const error = params.get("spotify_error");
    if (result === "connected") setMessage("Spotify connected — your library is ready.");
    if (result === "disconnected") setMessage("Spotify disconnected.");
    if (error) setMessage(ERROR_TEXT[error] ?? "Spotify authorization failed — try again.");
    if (result || error) {
      params.delete("spotify");
      params.delete("spotify_error");
      window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    }
    void refreshProfile();
  }, [refreshProfile]);

  const loadLiked = useCallback(async (page: number) => {
    setListError(null);
    try {
      const response = await fetch(`/api/spotify/library/tracks?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`);
      const data = await response.json();
      if (!response.ok) throw new Error(ERROR_TEXT[data.error] ?? "Couldn't load Liked Songs.");
      setLiked(data as Paged<SpotifyTrack>);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "Couldn't load Liked Songs.");
    }
  }, []);

  const loadPlaylists = useCallback(async (page: number) => {
    setListError(null);
    try {
      const response = await fetch(`/api/spotify/library/playlists?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`);
      const data = await response.json();
      if (!response.ok) throw new Error(ERROR_TEXT[data.error] ?? "Couldn't load playlists.");
      setPlaylists(data as Paged<SpotifyPlaylist>);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "Couldn't load playlists.");
    }
  }, []);

  const loadPlaylistTracks = useCallback(async (id: string, page: number) => {
    setPlaylistLoading(true);
    setListError(null);
    try {
      const response = await fetch(`/api/spotify/playlists/${encodeURIComponent(id)}?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`);
      const data = await response.json();
      if (!response.ok) throw new Error(ERROR_TEXT[data.error] ?? "Couldn't load playlist tracks.");
      setOpenPlaylist(data as PlaylistTracks);
      setLikedPage(0);
      setPlaylistPage(page);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "Couldn't load playlist tracks.");
    } finally {
      setPlaylistLoading(false);
    }
  }, []);

  // Load the active tab's first page once connected.
  useEffect(() => {
    if (status !== "connected") return;
    if (tab === "liked") {
      if (!liked) void loadLiked(0);
    } else if (!playlists) void loadPlaylists(0);
  }, [status, tab, liked, playlists, loadLiked, loadPlaylists]);

  const disconnect = () => {
    setProfile(null);
    setLiked(null);
    setPlaylists(null);
    setOpenPlaylist(null);
    setLikedPage(0);
    setPlaylistPage(0);
    setStatus("anonymous");
    // POST clears the cookies, then reload the panel state.
    void fetch("/api/spotify/logout", { method: "POST" }).then(() => void 0);
  };

  const pageCount = (total: number) => Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card id="spotify-library" className={cn("rounded-xl scroll-mt-24", className)}>
      <CardHeader
        title="Your Spotify"
        description={
          status === "connected"
            ? `Connected as ${profile?.name ?? "…"} — liked songs, private and collaborative playlists.`
            : "Connect a Spotify account to browse its library alongside ZYRAVA's own catalogue."
        }
        actions={
          status === "connected" ? (
            <Button variant="outline" size="sm" onClick={disconnect}>
              Disconnect
            </Button>
          ) : null
        }
      />
      <CardContent className="p-3 sm:p-4">
        {message ? (
          <Notice
            tone={message.includes("connected —") || message.includes("ready") || message === "Spotify connected — your library is ready." ? "success" : "warning"}
            title={message}
            className="mb-3"
            action={
              <Button variant="outline" size="sm" onClick={() => setMessage(null)}>
                Dismiss
              </Button>
            }
          >
            {message === "Spotify connected — your library is ready." ? null : null}
          </Notice>
        ) : null}

        {status === "loading" ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted">
            <Spinner className="size-4" /> Checking Spotify session…
          </div>
        ) : null}

        {status === "anonymous" ? (
          <div className="flex flex-col items-start gap-3 py-4">
            <a
              href="/api/spotify/login"
              className="inline-flex h-11 items-center gap-2.5 rounded-lg bg-[#1DB954] px-5 text-sm font-bold text-black transition-transform hover:scale-[1.02] active:scale-95"
            >
              <SpotifyMark className="size-5" />
              Continue with Spotify
            </a>
            <p className="max-w-md text-[11px] leading-relaxed text-muted">
              Read-only access: your profile, Liked Songs, private and collaborative playlists.
              Tokens stay in an httpOnly cookie and are never exposed to the page.
            </p>
          </div>
        ) : null}

        {status === "connected" ? (
          <>
            {/* Tabs: liked songs / playlists */}
            {openPlaylist ? (
              <div className="mb-3">
                <Button variant="outline" size="sm" onClick={() => setOpenPlaylist(null)}>
                  <Icon name="chevron-left" className="size-4" /> All playlists
                </Button>
              </div>
            ) : (
              <div className="mb-3 inline-flex overflow-hidden rounded-lg border border-separator">
                {(["liked", "playlists"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={tab === value}
                    onClick={() => setTab(value)}
                    className={cn(
                      "h-9 px-4 text-[13px] font-bold transition-colors",
                      tab === value ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
                    )}
                  >
                    {value === "liked" ? "Liked Songs" : "Playlists"}
                  </button>
                ))}
              </div>
            )}

            {listError ? (
              <Notice tone="warning" title="Spotify library" className="mb-3">
                {listError}
              </Notice>
            ) : null}

            {/* Open playlist's tracks */}
            {openPlaylist ? (
              playlistLoading && !openPlaylist ? (
                <div className="flex flex-col gap-1.5">
                  {Array.from({ length: 6 }).map((_, row) => (
                    <Skeleton key={row} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              ) : (
                <>
                  <TrackList tracks={openPlaylist.tracks.items} />
                  <Pagination
                    className="mt-3"
                    page={playlistPage + 1}
                    pageCount={pageCount(openPlaylist.tracks.total)}
                    total={openPlaylist.tracks.total}
                    pageSize={PAGE_SIZE}
                    onChange={(next) => void loadPlaylistTracks(openPlaylist.playlist.id, next - 1)}
                  />
                </>
              )
            ) : tab === "liked" ? (
              liked ? (
                liked.items.length === 0 ? (
                  <EmptyState title="No liked songs yet" description="Songs you like on Spotify will appear here." />
                ) : (
                  <>
                    <TrackList tracks={liked.items} />
                    <Pagination
                      className="mt-3"
                      page={likedPage + 1}
                      pageCount={pageCount(liked.total)}
                      total={liked.total}
                      pageSize={PAGE_SIZE}
                      onChange={(next) => {
                        setLikedPage(next - 1);
                        void loadLiked(next - 1);
                      }}
                    />
                  </>
                )
              ) : (
                <div className="flex flex-col gap-1.5">
                  {Array.from({ length: 6 }).map((_, row) => (
                    <Skeleton key={row} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              )
            ) : playlists ? (
              playlists.items.length === 0 ? (
                <EmptyState title="No playlists found" description="This account has no playlists visible to the app." />
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {playlists.items.map((playlist) => (
                      <button
                        key={playlist.id}
                        type="button"
                        onClick={() => void loadPlaylistTracks(playlist.id, 0)}
                        className="group flex items-center gap-3 rounded-lg border border-separator bg-surface p-2.5 text-start transition-colors hover:border-accent/50 hover:bg-surface-secondary"
                      >
                        {playlist.cover ? (
                          <Image
                            src={playlist.cover}
                            alt=""
                            width={56}
                            height={56}
                            sizes="56px"
                            className="size-14 flex-none rounded-md object-cover"
                          />
                        ) : (
                          <span className="grid size-14 flex-none place-items-center rounded-md bg-surface-secondary text-muted">
                            <Icon name="music" className="size-5" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-bold text-foreground">
                            {playlist.name || "Untitled playlist"}
                          </span>
                          <span className="block truncate text-[11px] text-muted">
                            {playlist.total} tracks · {playlist.ownerName}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            {playlist.collaborative ? <Badge label="Collab" /> : null}
                            {playlist.ownedByUser && !playlist.isPublic ? <Badge label="Private" /> : null}
                          </span>
                        </span>
                        <Icon
                          name="chevron-right"
                          className="size-4 flex-none text-muted transition-colors group-hover:text-foreground"
                        />
                      </button>
                    ))}
                  </div>
                  <Pagination
                    className="mt-3"
                    page={playlistPage + 1}
                    pageCount={pageCount(playlists.total)}
                    total={playlists.total}
                    pageSize={PAGE_SIZE}
                    onChange={(next) => {
                      setPlaylistPage(next - 1);
                      void loadPlaylists(next - 1);
                    }}
                  />
                </>
              )
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, tile) => (
                  <Skeleton key={tile} className="h-[4.5rem] w-full rounded-lg" />
                ))}
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-separator px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-muted">
      {label}
    </span>
  );
}

function TrackList({ tracks }: { tracks: SpotifyTrack[] }) {
  return (
    <ol className="flex flex-col gap-1.5">
      {tracks.map((track, position) => (
        <li
          key={`${track.id}-${position}`}
          className="flex items-center gap-3 rounded-lg border border-separator bg-surface px-2.5 py-2"
        >
          {track.cover ? (
            <Image
              src={track.cover}
              alt=""
              width={40}
              height={40}
              sizes="40px"
              className="size-10 flex-none rounded-md object-cover"
            />
          ) : (
            <span className="grid size-10 flex-none place-items-center rounded-md bg-surface-secondary text-muted">
              <Icon name="music" className="size-4" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-bold text-foreground">{track.name}</span>
              {track.isLocal ? <Badge label="Local" /> : null}
            </span>
            <span className="block truncate text-[11px] text-muted">
              {track.artists.join(", ") || "Unknown artist"}
              {track.album ? ` · ${track.album}` : ""}
            </span>
          </span>
          <span className="flex-none text-[11px] font-semibold tabular-nums text-muted">
            {track.durationMs ? formatDuration(track.durationMs) : "—"}
          </span>
        </li>
      ))}
    </ol>
  );
}
