/**
 * Spotify integration configuration.
 *
 * Only the client id is read here. The Authorization Code with PKCE flow
 * never needs the client secret, so the app deliberately never reads
 * `SPOTIFY_CLIENT_SECRET` — nothing to leak.
 */

export const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
export const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
export const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

/** Read-only scopes — the minimum the app's features need. */
export const SPOTIFY_SCOPES = [
  "user-read-private",
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
] as const;

/** Reads the client id from the environment; empty string when unset. */
export function spotifyClientId(): string {
  return (process.env.SPOTIFY_CLIENT_ID ?? "").trim();
}

/**
 * The exact redirect URI Spotify calls back to. Must match a URI registered
 * in the Spotify dashboard character-for-character.
 *
 * Default: the dev server's own callback route (http://localhost:3000 — the
 * port `next dev` runs on). Override with SPOTIFY_REDIRECT_URI when the app
 * is hosted elsewhere.
 */
export function spotifyRedirectUri(): string {
  return (
    (process.env.SPOTIFY_REDIRECT_URI ?? "").trim() ||
    "http://localhost:3000/api/spotify/callback"
  );
}
