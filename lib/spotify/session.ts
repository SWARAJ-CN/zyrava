/**
 * Spotify session handling for route handlers.
 *
 * Tokens live in an httpOnly cookie — browser JavaScript never sees them.
 * The flow is PKCE-only: the token exchange is authenticated with the code
 * verifier, so the client secret is never read anywhere in this file.
 *
 * The access token is refreshed transparently when it is about to expire;
 * Spotify may rotate the refresh token on refresh, so the cookie is rewritten
 * whenever a new one arrives.
 */
import { cookies } from "next/headers";
import {
  SPOTIFY_API_BASE,
  SPOTIFY_TOKEN_URL,
  spotifyClientId,
  spotifyRedirectUri,
} from "./config";

export type SpotifyTokens = {
  accessToken: string;
  refreshToken: string;
  /** Unix ms when the access token stops working. */
  expiresAt: number;
  /** Granted scopes as reported by Spotify. */
  scope: string;
};

export type PkceCookie = { verifier: string; state: string };

const TOKEN_COOKIE = "spotify_tokens";
const PKCE_COOKIE = "spotify_pkce";
/** Token cookie lifetime — 30 days; the refresh token keeps it alive. */
const TOKEN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
/** Authorization round-trip window for the PKCE cookie. */
const PKCE_COOKIE_MAX_AGE = 600;

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decode<T>(raw: string): T | null {
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

async function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: (await spotifyRedirectUri()).startsWith("https"),
    path: "/",
    maxAge,
  };
}

export async function writeTokens(tokens: SpotifyTokens): Promise<void> {
  const jar = await cookies();
  jar.set(TOKEN_COOKIE, encode(tokens), await cookieOptions(TOKEN_COOKIE_MAX_AGE));
}

export async function readTokens(): Promise<SpotifyTokens | null> {
  const jar = await cookies();
  const raw = jar.get(TOKEN_COOKIE)?.value;
  if (!raw) return null;
  const tokens = decode<SpotifyTokens>(raw);
  if (!tokens?.accessToken || !tokens?.refreshToken) return null;
  return tokens;
}

/** Writes the pending PKCE verifier + state before redirecting to Spotify. */
export async function writePkceCookie(value: PkceCookie): Promise<void> {
  const jar = await cookies();
  jar.set(PKCE_COOKIE, encode(value), await cookieOptions(PKCE_COOKIE_MAX_AGE));
}

export async function readPkceCookie(): Promise<PkceCookie | null> {
  const jar = await cookies();
  const raw = jar.get(PKCE_COOKIE)?.value;
  if (!raw) return null;
  return decode<PkceCookie>(raw);
}

export async function clearSpotifyCookies(): Promise<void> {
  const jar = await cookies();
  jar.set(TOKEN_COOKIE, "", { ...(await cookieOptions(0)), maxAge: 0 });
  jar.set(PKCE_COOKIE, "", { ...(await cookieOptions(0)), maxAge: 0 });
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

/** Exchanges the authorization code for tokens using the PKCE verifier. */
export async function exchangeCodeForTokens(
  code: string,
  verifier: string
): Promise<SpotifyTokens | null> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: await spotifyRedirectUri(),
    client_id: spotifyClientId(),
    code_verifier: verifier,
  });
  return requestTokens(body);
}

/** Refresh-grant call; Spotify rotates the refresh token on some responses. */
export async function refreshAccessToken(
  refreshToken: string
): Promise<SpotifyTokens | null> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: spotifyClientId(),
  });
  return requestTokens(body);
}

async function requestTokens(body: URLSearchParams): Promise<SpotifyTokens | null> {
  try {
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as TokenResponse | null;
    if (!response.ok || !payload?.access_token) return null;
    return {
      accessToken: payload.access_token,
      // Spotify does not always rotate; keep the old one when absent.
      refreshToken: payload.refresh_token ?? body.get("refresh_token") ?? "",
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
      scope: payload.scope ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * Returns a working access token, refreshing through the stored refresh
 * token when the current one is within a minute of expiring. Rewrites the
 * cookie when Spotify hands back a rotated refresh token.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await readTokens();
  if (!tokens) return null;
  if (tokens.expiresAt - Date.now() > 60_000) return tokens.accessToken;

  const refreshed = await refreshAccessToken(tokens.refreshToken);
  if (!refreshed) return null;
  await writeTokens(refreshed);
  return refreshed.accessToken;
}

/**
 * Authenticated Spotify Web API call from a route handler. Attaches the
 * bearer token; callers handle non-200 responses.
 */
export async function spotifyApiFetch(
  path: string,
  search: Record<string, string | number> = {},
  init: RequestInit = {}
): Promise<Response> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const url = new URL(`${SPOTIFY_API_BASE}${path}`);
  for (const [key, value] of Object.entries(search)) {
    url.searchParams.set(key, String(value));
  }
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}
