/**
 * Spotify integration configuration.
 *
 * Only the client id is read here. The Authorization Code with PKCE flow
 * never needs the client secret, so the app deliberately never reads
 * `SPOTIFY_CLIENT_SECRET` — nothing to leak.
 */

import { headers } from "next/headers";

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
 * The origin the app is being served from, taken from the request rather than
 * a build-time constant, so dev, preview and production each present their own.
 * Vercel forwards the real host and protocol to the function; the direct
 * `host` header covers anything running without the proxy.
 */
async function siteOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return "http://localhost:3000";
    const forwarded = h.get("x-forwarded-proto");
    const protocol =
      forwarded ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    return `${protocol}://${host}`;
  } catch {
    /* Called outside a request — fall back to the dev server. */
    return "http://localhost:3000";
  }
}

/**
 * The exact redirect URI Spotify calls back to. Must match a URI registered
 * in the Spotify dashboard character-for-character.
 *
 * Derived from the incoming request so a deployed app never sends the
 * localhost URI — a mismatch there is what Spotify reports as
 * "redirect_uri: Not matching configuration". Set SPOTIFY_REDIRECT_URI to
 * pin it explicitly instead.
 */
export async function spotifyRedirectUri(): Promise<string> {
  const configured = (process.env.SPOTIFY_REDIRECT_URI ?? "").trim();
  if (configured) return configured;
  return `${await siteOrigin()}/api/spotify/callback`;
}
