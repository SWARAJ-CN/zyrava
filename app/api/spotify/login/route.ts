/**
 * OAuth step 1 — "Continue with Spotify".
 *
 * Generates a PKCE verifier/challenge plus a CSRF state, stores them in
 * short-lived httpOnly cookies, and redirects to Spotify's authorize screen.
 * No data is exchanged with Spotify on behalf of the user yet.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  SPOTIFY_AUTHORIZE_URL,
  SPOTIFY_SCOPES,
  spotifyClientId,
  spotifyRedirectUri,
} from "@/lib/spotify/config";
import { createPkcePair, createRandomState } from "@/lib/spotify/pkce";
import { writePkceCookie } from "@/lib/spotify/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const clientId = spotifyClientId();
  if (!clientId) {
    return NextResponse.redirect(
      new URL("/?spotify_error=missing_client_id", request.nextUrl.origin)
    );
  }

  const { verifier, challenge } = createPkcePair();
  const state = createRandomState();

  const authorize = new URL(SPOTIFY_AUTHORIZE_URL);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("scope", SPOTIFY_SCOPES.join(" "));
  authorize.searchParams.set("redirect_uri", await spotifyRedirectUri());
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");

  await writePkceCookie({ verifier, state });
  return NextResponse.redirect(authorize.toString());
}
