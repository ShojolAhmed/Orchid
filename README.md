# Orchid

An unofficial, Spotify-inspired web player with a dark interface and magenta accents. You sign in with **your own Spotify account**, browse your music, and play it in the browser. Not affiliated with or endorsed by Spotify.

> **Status:** feature-complete for its scope and covered by automated tests, but **never run against a real Spotify account**. All tests use stubbed Spotify responses (see [docs/TESTING.md](docs/TESTING.md)). Expect to find issues on the first real run and please report them.

## Features
- Sign in with Spotify (Authorization Code + PKCE, no client secret), session restore, logout, and a **Reconnect** prompt when permissions are missing.
- **Search** tracks, albums, artists and playlists (debounced, filters, "Show more").
- **Home** shelves from your own data: library, recently played, top artists, playlists, saved albums, new releases.
- **Album, artist and playlist pages** with real artwork and linked artists.
- **Library:** liked songs, playlists, saved albums, followed artists (read-only); save/unsave tracks and albums, add a track to a playlist you own, create a private playlist.
- **Playback in the browser** through the Spotify Web Playback SDK: play/pause, previous/next, seek, volume, shuffle, repeat, queue view, device list and "play here", and a "Play a Spotify link" form. **Spotify Premium is required to play.**
- Responsive layout (sidebar, icon rail and bottom tabs; mobile now-playing sheet), keyboard support, skip link, reduced-motion support.

Spotify withholds some data from development-mode apps (recommendations, artist top tracks, other people's playlist tracks, popularity). Orchid says so on screen rather than inventing substitutes. See [docs/API.md](docs/API.md).

## Screenshots
_Not captured yet._ Add images under `docs/images/` and reference them here:

| Home | Search | Album |
| --- | --- | --- |
| _placeholder_ | _placeholder_ | _placeholder_ |

## Tech stack
React 19, TypeScript (strict), Vite 8, react-router-dom 7, CSS Modules, lucide-react, oxlint. Tests: Node's built-in runner (unit) and Playwright for Python (browser). No backend: the app is a static single-page site.

## Architecture
Layers, top to bottom: `pages/` and `app/` → `features/*` (`auth`, `api`, `catalog`, `library`, `player`) → `components/` (presentational only) → `config/` and `styles/`. All Spotify HTTP goes through `features/api/client.ts`; all playback goes through `PlayerApi`. Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/AUTH.md](docs/AUTH.md), [docs/PLAYBACK.md](docs/PLAYBACK.md), [docs/API.md](docs/API.md).

## Prerequisites
- Node.js 22.18 or newer and npm.
- A Spotify account with **Premium** (needed to own a development-mode app and to play audio).
- A Spotify Developer app (below).

## Quick start
```bash
npm ci
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://127.0.0.1:5173
```
Open the app at **http://127.0.0.1:5173** (not `localhost`). The dev server is pinned to that origin because Spotify requires a loopback IP and the sign-in attempt is stored per origin.

## Environment variables
Everything prefixed `VITE_` is baked into the public browser bundle. Only put public values here. **Never add a Spotify client secret.**

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SPOTIFY_CLIENT_ID` | yes | Your app's Client ID from the Spotify Dashboard (public by design). |
| `VITE_SPOTIFY_REDIRECT_URI` | yes | Must exactly match a Redirect URI registered in the Dashboard. The path must be `/callback`, and the app must be served at the same origin. |
| `VITE_SPOTIFY_DEVICE_NAME` | no | Name shown in Spotify's device list. Default: `Orchid Web Player`. |

Restart the dev server after changing them. `.env.local` is git-ignored; only `.env.example` is committed.

## Spotify Developer Dashboard setup
1. Create an app at the [Dashboard](https://developer.spotify.com/dashboard) and tick **Web API** and **Web Playback SDK**.
2. Copy the **Client ID** (ignore the secret; Orchid never uses it).
3. In the app's Settings add Redirect URIs: `http://127.0.0.1:5173/callback` for local use and `https://YOUR-DOMAIN/callback` for production. Spotify requires HTTPS except for loopback IP literals; `localhost` is rejected; matching is exact.
4. Under **User Management**, add the name and Spotify email of every other person who will sign in.

### Spotify limits you will hit (checked against Spotify's docs, October 2026)
- A development-mode app works only while its **owner has Premium**.
- At most **5 allowlisted users**. Others can complete sign-in but Spotify answers their API calls with 403 (Orchid shows "Spotify is restricting access").
- Extended quota (unlimited users) is only granted to registered organizations with a launched service and roughly 250k monthly users. Individuals cannot apply.
- Development-mode apps share a request quota; exceeding it returns 429 `QUOTA_EXCEEDED`.
- Spotify's developer terms restrict streaming apps (for example, no commercial use). Read the [Developer Policy](https://developer.spotify.com/policy) before making a deployment public.
- These rules change; check Spotify's [quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) page.

## Commands
| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server on 127.0.0.1:5173 |
| `npm run build` | Type-check (`tsc -b`) and production build to `dist/` |
| `npm run preview` | Serve the built site on 127.0.0.1:5173 |
| `npm run lint` | oxlint |
| `npm run typecheck` | Strict type check of `src` and `tests` |
| `npm test` | Unit tests (196) |
| `python3 tests/e2e/smoke.py` | Browser tests (67), see [docs/TESTING.md](docs/TESTING.md) |

## Deployment (Vercel)
`vercel.json` is included. It routes every path to `index.html` (so `/callback` and deep links survive a reload), adds security headers, and sets a **Report-Only** Content-Security-Policy.

1. Push this repository to GitHub, then **Add New Project** in Vercel and import it. Framework preset: Vite. Build command `npm run build`, output directory `dist`.
2. Set environment variables for Production: `VITE_SPOTIFY_CLIENT_ID` and `VITE_SPOTIFY_REDIRECT_URI=https://YOUR-DOMAIN/callback` (optionally `VITE_SPOTIFY_DEVICE_NAME`). Variables are baked in at build time, so **redeploy after any change**.
3. Register that exact redirect URI in the Spotify Dashboard.
4. Open the site at the same origin as the redirect URI. Vercel preview URLs have different origins, so sign-in will not work on them unless you register and configure each one.

The CSP is Report-Only because Spotify does not publish the full list of hosts the SDK needs. After a real playback test, check the browser console for violation reports, adjust the policy, then switch the header to `Content-Security-Policy` in `vercel.json`. None of the deployment configuration has been tested on a live Vercel project.

## Troubleshooting
| Symptom | Likely cause and fix |
| --- | --- |
| Spotify page: "INVALID_CLIENT: Invalid redirect URI" | The redirect URI in your env file is not registered exactly as written. |
| "Open the app at … so sign-in can finish" | You opened a different origin (e.g. `localhost`) than the redirect URI's. |
| "Spotify is restricting access" / 403 | Add the account under User Management; confirm the app owner still has Premium. |
| "Reconnect Spotify" on library pages | Your session predates the library permissions. Use Reconnect in the account menu once. |
| Playback never starts or "Spotify player unavailable" | Premium required; check the browser console for SDK `account_error`; make sure the browser is not blocking `sdk.scdn.co`; try "Play here" in the devices menu. |
| Signed out after months | Spotify refresh tokens last about 6 months. Sign in again. |
| Sudden failures with 429 | Rate limit or `QUOTA_EXCEEDED`; wait and retry. |

## Project structure
```
src/
  app/          router, root composition
  pages/        Home, Search, Library, Album, Artist, Playlist, AuthCallback, NotFound
  features/     auth, api, catalog, library, player
  components/   layout/ (shell, nav, player bar, queue) and ui/ (primitives)
  config/ lib/ styles/
tests/          Node unit tests; e2e/ has the Python browser tests and Spotify stub
docs/           ARCHITECTURE, AUTH, API, PLAYBACK, TESTING
vercel.json     SPA fallback, headers, report-only CSP
```

## Security
Never commit credentials. Orchid needs no client secret; the refresh token is kept in `localStorage` (trade-offs in [docs/AUTH.md](docs/AUTH.md)). Report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## License
No license has been chosen yet, so all rights are reserved by default. Add a `LICENSE` file before inviting reuse.

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md).
