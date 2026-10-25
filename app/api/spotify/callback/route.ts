/**
 * OAuth step 2 — Spotify redirects here with the authorization code.
 *
 * Validates the state cookie (CSRF), exchanges the code for tokens using the
 * stored PKCE verifier (no client secret), stores the tokens in an httpOnly
 * cookie, and sends the user back to the home page. Every failure mode
 * redirects home with a human-readable `spotify_error` query flag.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeCodeForTokens,
  clearSpotifyCookies,
  readPkceCookie,
  writeTokens,
} from "@/lib/spotify/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(`/?spotify_error=${encodeURIComponent(reason)}`, request.nextUrl.origin)
    );

  const code = params.get("code");
  const state = params.get("state");
  if (params.get("error")) {
    return fail(params.get("error") === "access_denied" ? "access_denied" : "provider_error");
  }
  if (!code || !state) return fail("incomplete_callback");

  const pkce = await readPkceCookie();
  if (!pkce?.verifier || !pkce.state) return fail("session_expired");
  if (pkce.state !== state) {
    await clearSpotifyCookies();
    return fail("state_mismatch");
  }

  const tokens = await exchangeCodeForTokens(code, pkce.verifier);
  await clearSpotifyCookies();
  if (!tokens?.refreshToken) return fail("token_exchange");

  await writeTokens(tokens);
  return NextResponse.redirect(new URL("/?spotify=connected", request.nextUrl.origin));
}
