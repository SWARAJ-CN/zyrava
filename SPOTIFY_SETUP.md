# Spotify integration — setup guide (ZYRAVA)

ZYRAVA connects to Spotify with the **Authorization Code with PKCE** flow.
No client secret is required or used anywhere in the code — the token
exchange is authenticated by the PKCE `code_verifier` alone, and nothing
sensitive is ever shipped to the browser.

## 1. Spotify Developer App

1. Open <https://developer.spotify.com/dashboard> and open your app.
2. Under **Settings → Redirect URIs**, add **exactly** this URI:

   ```
   http://localhost:3000/api/spotify/callback
   ```

   This is the app's own OAuth callback route on the port the dev server
   runs on. Spotify's own collection page (`spotify.com/...`) must never be
   used as the redirect target.

   If you host the app somewhere else, set `SPOTIFY_REDIRECT_URI` in `.env`
   to the same path on that host and add the matching URI in the dashboard,
   e.g. `https://your-host.example.com/api/spotify/callback`.

3. Under **Which API/SDK modes are you planning to use?** keep
   **Web API** enabled. No Web Playback SDK / streaming scope is needed.

## 2. Environment

`.env` (already present, never commit it):

```
SPOTIFY_CLIENT_ID=<your client id>
```

`SPOTIFY_CLIENT_SECRET` may exist but the app never reads it — PKCE makes
it unnecessary, and keeping it out of the runtime guarantees it can't leak.
`.env.example` documents the keys; copy it to `.env` and fill values.

## 3. Scopes requested

The login button asks for read-only scopes, the minimum needed for the
features the app loads:

| Scope | Why |
| --- | --- |
| `user-read-private` | Show the profile name/avatar after connecting |
| `user-library-read` | Liked Songs |
| `playlist-read-private` | Private playlists |
| `playlist-read-collaborative` | Collaborative playlists |

No write, no playback, no e-mail scopes.

## 4. How the flow works

1. **Continue with Spotify** (dock / library panel) → `GET /api/spotify/login`.
   The server generates a PKCE code verifier + challenge and a random
   `state`, stores both in short-lived `httpOnly` cookies, and redirects to
   Spotify's authorize screen.
2. The user approves; Spotify redirects back to
   `/api/spotify/callback?code=…&state=…`.
3. The callback validates `state`, exchanges the code for tokens
   (`code_verifier`, no secret), stores access/refresh tokens in an
   `httpOnly` cookie, and redirects back to the home page.
4. Library routes (`/api/spotify/…`) read the token cookie server-side,
   refresh it transparently when expired, and proxy Spotify catalogue data
   to the UI. Tokens never reach browser JavaScript.

## 5. What gets loaded

- **Liked Songs** — paginated, 24 per page, newest first (Spotify's API limit is 50; the UI pages through).
- **Playlists** — your playlists including private and collaborative ones, paginated (24 per page).
- **Playlist tracks** — paginated per playlist, wherever the Web API
  supports the endpoint for that playlist.

If a playlist or track cannot be loaded (e.g. a local-only track), the
route reports it and the UI shows the entries it could load — no silent
pretending.

## 6. Testing

1. `npm run dev`, open <http://localhost:3000>.
2. Click **Continue with Spotify**, approve the scopes with a real account.
3. You land back on the home page; the "Your Spotify" section shows your
   profile and library. Flip pages, open playlists, check collaborative and
   private ones.

The integration is only considered verified once steps 1–3 pass against a
real Spotify account — the code makes no requests until you press the
button.
