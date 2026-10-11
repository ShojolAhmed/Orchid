# Architecture

## Layers (dependencies point downward only)

1. `pages/`, `app/`: routes and screen composition.
2. `features/*`: `auth`, `api`, `catalog`, `library`, `player`. Each owns its hooks, state and Spotify calls.
3. `components/layout`, `components/ui`: presentational only. No fetches, no SDK access.
4. `config/`, `styles/`: env config and design tokens.

## Directories

`features/api` (phase 5): `client.ts` is the only code that calls `api.spotify.com` (token refresh, rate limits, in-flight de-dup, cache, cancel); `endpoints.ts` has one typed function per endpoint; `models.ts` are raw response types; `instance.ts` wires the real session. `features/catalog`: `types.ts` (domain), `mappers.ts` (raw -> domain), `catalogService.ts` (composes endpoints; framework-free), `service.ts` (real binding), `hooks.ts` (gated data hooks), `adapters.ts`, `ApiErrorState`. `features/library`: saved-items store and per-row actions. `features/player`: `PlayerApi`, engines, connected bar and queue. `app/Root.tsx` is the composition root. `lib/` holds pure helpers (format, paths, hue, `useResource`).

`features/auth` (phase 3): framework-free core (`session.ts` state machine, `pkce.ts`, `tokenClient.ts`, `storage.ts`, `config.ts`, `scopes.ts`, `profile.ts`, `errors.ts`) that takes all dependencies by injection and is unit-tested in Node; React binding (`AuthProvider`, `useAuth`, `useAuthNotice`); `connected.tsx` + `accountView.ts` map session state onto the presentational `components/layout/AccountMenu`. `app/App.tsx` mounts `AuthProvider` outside the router; `/callback` is a normal route (`pages/AuthCallback.tsx`). See `docs/AUTH.md`.

## Conventions

- Plain CSS Modules; all values come from `src/styles/tokens.css`.
- Breakpoints: tablet `max-width: 1023px`, mobile `max-width: 767px`.
- Icon-only buttons must use `IconButton` with a `label`.
- Every data view needs loading, error, empty and restricted (non-Premium / unauthorized) states.
- Presentational components take view models (for example `TrackRowData`, `PlayerViewState`); `features/catalog/adapters.ts` and `features/player/connected.tsx` map domain objects to them.
- All Spotify data access goes through `catalogService` (async, may reject) and, below it, `features/api/client.ts`. All playback goes through `PlayerApi`. Never call `fetch` for Spotify anywhere else.
- Never fabricate data: if Spotify does not provide something there is no method for it; the UI says so. Writes are never optimistic.
- Hooks that call a scoped endpoint take their `enabled` from `useFeatureAccess`, so no request is made that is certain to fail.
- TypeScript is `strict`. Tests live in `tests/` and run with `npm test`.
