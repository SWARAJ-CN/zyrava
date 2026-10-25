/**
 * PKCE (RFC 7636) helpers for the Spotify authorization flow.
 *
 * Spotify requires the S256 challenge method for apps that authenticate
 * without a client secret. The code verifier lives in an httpOnly cookie
 * between the authorize redirect and the callback; the challenge derived
 * from it goes to Spotify in the authorize URL.
 */
import { createHash, randomBytes } from "node:crypto";

export type PkcePair = {
  /** 64-char verifier kept server-side in a cookie. */
  verifier: string;
  /** BASE64URL(SHA256(verifier)) sent to Spotify as code_challenge. */
  challenge: string;
};

/** Generates a fresh verifier + S256 challenge pair. */
export function createPkcePair(): PkcePair {
  // 48 random bytes → 64 base64url chars, within Spotify's 43–128 range.
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

/** Opaque single-use state token for CSRF protection on the callback. */
export function createRandomState(): string {
  return randomBytes(16).toString("base64url");
}
