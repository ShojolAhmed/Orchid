# Orchid: project context

Unofficial, Spotify-inspired web player. Phases 1 to 6 are complete in code (phase 6 = polish, security audit, GitHub/deployment readiness). All catalog and library data now comes from the Spotify Web API; **nothing has been run against real Spotify** (no credentials), only against a stub built from Spotify's published response shapes. Latest handoff: `PROJECT_HANDOFF_NOTES.md`. API facts and restrictions: `docs/API.md`. Playback: `docs/PLAYBACK.md`.

> Naming: the repo, package and UI are "Orchid". The phase prompts call the project "MAGENTA". The repo name was kept.

## Phase log
1. Scaffold: Vite, React 19, TypeScript, CSS Modules, tokens, shell placeholders, Spotify env config.
2. Mock music-player UI.
3. Spotify authentication: PKCE login, session layer, account UI, tests, docs.
4. Web Playback SDK: real playback engine, scopes enabled, status UI, tests, docs.
5. **Real search, discovery and library (this phase):** typed Web API client, real catalog, saved items, playlists, access gating, tests, docs.
6. **Final polish, audit, GitHub and deployment readiness (this phase):** dev-only setup panel hidden in production, popover focus fixes, `.gitignore`, `vercel.json`, CI, README and docs rewritten. Release status below.

## Stack and commands
React 19, react-router-dom 7, lucide-react, Vite 8, TypeScript 6 (now `strict: true`), oxlint. No dependencies were added in phases 2 to 4 (the SDK is a script tag).

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server pinned to http://127.0.0.1:5173 (`strictPort`; required so the origin matches the Spotify redirect URI) |
| `npm run lint` | oxlint (0 warnings, 0 errors) |
| `npm run typecheck` | `tsc -p tsconfig.tests.json`: strict check of `src` and `tests` |
| `npm run preview` | Serves `dist/` on 127.0.0.1:5173 |
| `npm run build` | `tsc -b` then `vite build` |
| `npm test` | Node's built-in test runner on `tests/**/*.test.ts` (reducer, auth, playback, API client, catalog, saved store: 196 tests; needs Node 22.18+) |
| `python3 tests/e2e/smoke.py` | 67 real-Chromium checks against a stubbed Spotify. Needs Playwright for Python and the dev server started with `VITE_SPOTIFY_CLIENT_ID=testclient VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/callback`. Not part of `npm test` |

The `?mock=` switches and all invented catalog data were removed in phase 5.

## Release status (phase 6)
- **Verified (stubbed Spotify only):** lint 0/0, typecheck clean, 196 Node tests, production build, 67 browser checks (final run was against the production bundle).
- **Security audit:** no secrets, no tracked `.env`, no client-secret references, `npm audit` 0 vulnerabilities, no secret in the bundle. Standing risk: refresh token in `localStorage` (docs/AUTH.md).
- **Repo files:** `.gitignore` (env, build, caches, python bytecode), `.editorconfig`, `.gitattributes`, `.nvmrc`, `vercel.json` (SPA rewrite, headers, **Report-Only** CSP), `.github/workflows/ci.yml` (lint, typecheck, test, build), `SECURITY.md`, `CONTRIBUTING.md`, `docs/TESTING.md`. **No LICENSE** (owner has not chosen one).
- **Not verified:** real Spotify account, real audio, screen readers, a live Vercel deploy (rewrite and headers untested there), CSP against the real SDK, browser tests in CI.
- **Git:** the delivered project had no `.git`. Nothing has been committed or pushed.
- Spotify rules rechecked October 2026 against Spotify's quota-modes and redirect-URI pages (see README).

## Routes (`src/app/router.tsx`)
`/` Home, `/search` (`?q=`), `/library`, `/album/:id`, `/artist/:id`, `/playlist/:id`, `/callback` (OAuth redirect, `pages/AuthCallback.tsx`), `*` NotFound. Paths come from `src/lib/paths.ts`.

## Implemented
**Pages** (`src/pages`): Home, Search, Library, Album, Artist, Playlist, NotFound (what each does with real data: see "Phase 5" below). Shared: `cards.tsx`, `DetailSkeleton.tsx`, `SetupStatus.tsx` (diagnostics render only when `import.meta.env.DEV`; the "Play a Spotify link" form stays in production).

**Layout** (`src/components/layout`, presentational): `AppShell` (slots for nav, player, queue), `Navigation` (sidebar / icon rail / bottom tabs, playlist shortcuts), `TopBar` (back/forward, account menu; the "Preview mode" badge was removed in phase 5), `PlayerBar`, `TransportControls`, `SeekBar`, `VolumeControl`, `NowPlayingSheet` (mobile full-screen, native `<dialog>`), `QueuePanel` (3rd column on desktop, overlay below 1024px).

**UI primitives** (`src/components/ui`): Artwork (gradient placeholder or `imageUrl`), Logo, Slider, Popover, Chip, Toast, PlayButton, MediaCard, Shelf/CardGrid, TrackList (+skeleton), DetailHeader, ErrorState, CardSkeletons, plus the existing Button, IconButton, EmptyState, Skeleton.

**Features**
- `features/catalog`: domain `types.ts`; `mappers.ts` (raw Spotify -> domain, defensive); `catalogService.ts` (framework-free, injected endpoints, the only data door); `service.ts` (binds it to the real client); `hooks.ts` (gated data hooks); `adapters.ts` (domain -> UI shapes); `ApiErrorState.tsx`.
- `features/api` (phase 5): `client.ts` (auth refresh, rate limits, de-dup, cache, cancel), `endpoints.ts` (one typed function per endpoint), `models.ts` (raw response types), `errors.ts`, `instance.ts` (real wiring, account-change reset).
- `features/library` (phase 5): `savedStore.ts` (saved-state store), `useSaved*`, `useTrackActions` (heart + add-to-playlist per row), `AddToPlaylist`, `NewPlaylistForm`.
- `features/player`: `types.ts` defines `PlayerApi` (`state`, `actions`, `engine`, `notice`); `reducer.ts` is a pure reducer (seeded shuffle, queue, repeat, history); `useMockPlayer` runs a 250 ms clock (only used signed out, where there is now nothing to play); `connected.tsx` binds the presentational player and queue; `usePlayCollection`, `useTrackPlayback`.
- `app/Root.tsx`: composition root. Picks the player engine and wires features into layout slots.

**Interactions**: navigation; play/pause from cards, tiles, rows and headers (toggles when that context is active); next/previous; seek and volume; shuffle; repeat; add-to-queue (temporary) with toast; queue panel; search with scope filters and "Show more"; library filters, sort and paging; save/unsave (heart), add to playlist, create playlist; mobile now-playing sheet.

**Accessibility**: skip link, labelled icon buttons, `aria-pressed` toggles, live regions (toast, result counts), native range inputs with `aria-valuetext`, Escape closes queue/sheet/popovers, focus returns after queue closes, reduced-motion respected. Tokens adjusted for AA contrast: `--color-text-faint` and `--color-accent` (white on accent is 5.0:1).

## Phase 3: authentication (summary; details in `docs/AUTH.md`)
- **Flow:** Authorization Code + PKCE (S256), public client, no secret anywhere. State validated; attempt is one-time, per-tab (`sessionStorage`), 10-minute limit.
- **Code:** `src/features/auth`. Framework-free core (`session.ts` and helpers, dependency-injected, Node-tested) + React binding (`AuthProvider` mounted in `App.tsx` above the router, `useAuth()` returning `{state, actions, configIssues}`, `useAuthNotice`). `connected.tsx` + `accountView.ts` feed the presentational `components/layout/AccountMenu` through a new `account` slot on `AppShell`/`TopBar`. `components/ui/Spinner` added.
- **Tokens:** access token in memory only; refresh token in `localStorage` key `orchid.spotify.credentials.v1` (risk documented); single-flight refresh per tab plus Web Locks across tabs; rotated refresh tokens persisted by compare-and-set; `invalid_grant` clears the session; no assumed lifetimes, refresh token, or scopes.
- **Scopes requested now: none** (profile fields used need no scope). `scopes.ts` maps features to scopes; `ENABLED_FEATURES` controls the request; session exposes `missingScopes` and the menu offers Reconnect. The old `scopes` array was removed from `config/spotify.ts`.
- **UI:** top bar shows "Connect Spotify" (shortened on narrow screens) or an avatar menu with name, Disconnect, messages, setup problems; loading labels for restore/redirect/exchange; Toast shows auth notices; `/callback` page shows progress or a specific failure; Home "Setup status" shows real config and connection state. "Preview mode" badge is unchanged because data is still mock.
- **Config:** `.env.example` (`VITE_SPOTIFY_CLIENT_ID`, `VITE_SPOTIFY_REDIRECT_URI`); `getConfigIssues` rejects missing values, `localhost`, non-HTTPS non-loopback, wrong path (must be `/callback`) and an app origin that differs from the redirect origin.

## Verification done
Phase 3: lint 0/0; strict typecheck (src and tests); production build, bundle has no secret references; 86 Node tests (10 reducer, 76 auth: PKCE RFC 7636 vector, config, state/CSRF, callback errors, exchange, expiry, single-flight, cross-tab rotation, revocation, logout races, no-logging scan); 21 real-Chromium checks against a stubbed Spotify (PKCE verified server-side, login, reload restore, rotation, logout, cancel, forged state, stray callback, 403, revoked token, no overflow at 390/900 px). **Not run against real Spotify** (no credentials). Phase 2: headless Chromium at 1440, 900 and 390 px across 9 routes: no horizontal overflow, no console errors; scripted interactions for play, seek, queue, search, library, error and 404 states, mobile sheet.

## Known limitations
- **Never run against real Spotify.** Unverified points are listed in `docs/API.md` (library scope mapping, `tag:new`, artist follow, embedded playlist items) and the handoff.
- Spotify withholds data from development-mode apps (recommendations, browse, artist top tracks, other users' playlist tracks, popularity, followers). Orchid shows honest notices instead of substitutes.
- Search returns at most 10 per kind per request; paging works in the filtered views (offset window 1,000).
- Liked Songs plays the first 50 saved tracks as a list (no public context URI). Followed artists are read-only. Playlist editing is create + add track only (no remove, reorder, rename, delete). No heart on the player bar.
- Playback buttons on cards start a Spotify context and cannot be exercised without a real SDK device; only the request builder is unit-tested.
- Queue shows at most 30 upcoming tracks; back/forward are always enabled.
- Auth restrictions: development-mode apps need a Premium owner and at most 5 allowlisted users; `GET /me` omits `product`/`email`/`country`; refresh tokens expire after 6 months and live in `localStorage` (XSS-readable).
- No component (DOM) test runner; the browser checks are a Python script, not part of CI.

## Mocks
All mock catalog data is gone (phase 5). The only simulation left is the silent mock player engine, used when signed out, where no catalog exists to play.

## Phase 4: playback (summary; details in `docs/PLAYBACK.md`)
- **Engine:** `features/player/spotify/engine.ts` (framework-free, Node-tested with a fake SDK) + `useSpotifyPlayer` + `PlayerProvider`, which holds both engines (mock and Spotify) so nothing remounts; `app/Root.tsx` mounts `PlayerProvider`. `useMockPlayer` replaces `MockPlayerProvider`.
- **Scopes now requested:** `streaming`, `user-modify-playback-state`, `user-read-email`, `user-read-private` (`ENABLED_FEATURES` includes `playback`). Existing sessions show **Reconnect**; until then the simulated engine runs.
- **Interface changes:** `PlayerApi.status` (availability, label, detail, action), new actions `playSpotifyLink`, `playHere`, `retryPlayer`; `PlayOptions.contextUri`; `Track.uri?`; `PlayableCollection.contextUri?`. Presentational: devices menu shows real status plus one action button; idle subtitle shows status; play button waits while a start request is in flight; queue hides unknown durations; Home Setup status gained a playback line and a "Play a Spotify link" form.
- **Sample data cannot be played for real** (no URIs). With the Spotify engine active it says so instead of pretending.
- Not feasible with the SDK/API: removing queue items, separating user-queued tracks from context, jumping to an arbitrary queue item (done by skipping forward).

## Phase 5: search, discovery and library (summary; details in `docs/API.md`)
- **Data flow:** page -> gated hook (`features/catalog/hooks.ts`, uses `useResource`/`usePagedResource`: cancel on change, ignore stale, no request while access is missing) -> `catalogService` -> `endpoints` -> `client`. UI components never see raw responses.
- **Access gating:** `features/auth/access.ts` (`evaluateAccess`) + `useFeatureAccess` + `AccessGate`: signed-out shows Connect, a session missing a scope shows Reconnect (with no doomed request), an unconfigured app says so. `ApiErrorState` maps every `SpotifyApiError` kind to reconnect / restricted / wait / retry.
- **Scopes:** 13 (see `docs/API.md`); `FEATURE_SCOPES` has `library`, `playlists`, `following`, `personalization` beside `profile`, `playback`. The player's eligibility now checks **only** playback scopes, so older sessions keep playing until they reconnect for library features.
- **Search:** 350 ms debounce, one request for 4 kinds at limit 10, aborts superseded requests, URL synced, filters with "Show more" (offset paging), suggestion tiles are plain searches (browse categories no longer exist).
- **Home:** From your library (own playlists + saved albums), Recently played (albums derived from real plays), Your top artists, Your playlists, Saved albums, New releases (`tag:new` search, hides on failure). Each shelf loads and fails alone. A disclosure explains what Spotify no longer provides.
- **Album / Artist / Playlist:** real artwork with gradient fallback, release dates at the precision Spotify gave, linked artists (plain text when no id), discography grouped and de-duplicated, playlist tracks only when shared (otherwise a notice plus Play), skipped items (episodes, local files) counted and explained, "Show more" paging.
- **Library:** Liked Songs, playlists, saved albums, followed artists, each independent with its own error/retry; sort; paging; a notice separating Spotify's library from the temporary queue.
- **Writes:** heart (save/remove) is **not optimistic** (pending, then flips on Spotify's confirmation; failure leaves state and says why); add track to own/collaborative playlist; create private playlist. Saved-state lookups are batched (`savedStore`).
- **Playback:** all through `PlayerApi`. Cards play by context URI without fetching; rows pass `contextUri`; search and Liked Songs play as URI lists. `playbackMap` no longer sets `genres`.
- **Removed:** `features/catalog/mock`, `behavior.ts`, `useAsync`, `?mock=` flags, "Preview mode" badge, `Track.genres`, `Artist.monthlyListeners/bio`, `Album.genre/trackIds`.
- **Verification:** lint 0/0, strict typecheck, build ok, 196 Node tests, 60 Chromium checks against a stub.
