# Spotify playback (Prompt 4)

Real audio through the official [Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk). Docs re-read on 2026-10-11: SDK reference, scopes page, Start/Resume Playback page, February 2026 Web API changelog.

## Who does what (Spotify's rules)
| Operation | Mechanism | Notes |
| --- | --- | --- |
| play/pause/toggle, next, previous, seek, volume | SDK `Player` methods | Local device only. Volume is not settable on iOS (Apple). |
| start a context or list of tracks | Web API `PUT /me/player/play?device_id=` | `uris` (tracks) or `context_uri` (album, playlist, artist). `offset` only for album/playlist or with `uris`. |
| transfer playback | Web API `PUT /me/player` | The SDK docs warn playback does not auto-start after a transfer. |
| shuffle, repeat | Web API `PUT /me/player/shuffle`, `/repeat` | The SDK has no setter; it reports the result in `player_state_changed`. |
| add to queue | Web API `POST /me/player/queue?uri=` | No remove-from-queue endpoint exists; the UI says so. |

All Web API calls need `user-modify-playback-state`; the SDK needs `streaming` (Premium). All Player endpoints remain available to development-mode apps (Feb 2026 changelog). Only `spotify:track:<22 chars>` style URIs reach a request (`spotify/uris.ts`); links are converted, display URLs are never sent.

## Code map (`src/features/player`)
- `spotify/engine.ts`: framework-free player. Lifecycle, listeners, snapshot, commands, guards. Everything testable runs in Node with a fake SDK (`tests/helpers/spotify-harness.ts`).
- `spotify/sdkLoader.ts`: script loaded once per page, ready callback installed before the tag, failed loads cleaned for retry.
- `spotify/webApi.ts`: Player endpoints, 401 then one retry with a fresh token (via the auth session), 403/404/429/5xx mapped to `PlaybackIssue`s.
- `spotify/playbackIssues.ts`: every message the person can see.
- `spotify/playbackMap.ts`, `startRequest.ts`, `uris.ts`: pure mapping and request building.
- `useSpotifyPlayer.ts`: React binding (`useSyncExternalStore`), connects only while eligible. `PlayerProvider.tsx`: holds both engines so nothing remounts; `eligibility.ts` decides which runs.
- `useMockPlayer.ts`: the old simulated engine, unchanged behaviour.

Tokens: `getOAuthToken` calls `useAuth().actions.getAccessToken()`; the engine never refreshes or stores tokens, and never calls the SDK back with an empty token.

## Behaviour worth knowing
- **Eligibility:** signed in and the four playback scopes granted (`FEATURE_SCOPES.playback`). Only playback scopes decide this, so a session from before the library scopes existed keeps playing; library pages ask it to reconnect on their own. Premium cannot be read in development mode; the SDK's `account_error` is the authority.
- **Items without a valid Spotify URI are never sent.** The player shows "This item can't be played because it has no Spotify link" instead. Signed out, the silent simulated engine remains but has nothing to play. To play a pasted link, use "Play a Spotify link" at the bottom of Home.
- **Progress** comes from `getCurrentState()` once a second while playing and the tab is visible (plus every SDK event). No local clock. Updates that change nothing visible do not re-render.
- **Clicks:** a repeated identical start request is dropped while one is in flight; a different one replaces whatever was waiting. Seeks coalesce into one trailing request; volume coalesces. Commands have a 4 s safety release.
- **Start sequence:** if Spotify has not reported this browser as active, transfer (`play:false`), then play; one retry after 600 ms on a 404.
- **Auth errors:** `authentication_error` invalidates the token and reconnects once per minute; a second one shows "Reconnect Spotify".
- **Reconnect:** `not_ready` shows reconnecting; the `online` event or "Retry player" rebuilds the player.
- **Autoplay:** first click or key press calls `activateElement()`; `autoplay_failed` shows a toast.
- **Queue panel:** the SDK does not separate user-queued tracks, so everything appears under "Next up". Removing and clearing are refused with an explanation. Clicking a "next" item skips forward that many tracks.

## CSP (production header, extends AUTH.md)
Add `https://sdk.scdn.co` to `script-src` and `frame-src`, and allow Spotify's streaming hosts. Spotify does not publish the full list; a starting point is `connect-src ... https://*.spotify.com wss://*.spotify.com https://*.scdn.co`, `media-src blob: https:`, `img-src https:` (album art is on `i.scdn.co`, but playlist covers can come from other Spotify hosts). **Unverified:** check the browser console on first real run.

## Policy
Spotify's notes: streaming apps may not be commercial, audio must stay unmodified, content must not be synchronised or broadcast. Orchid is a personal project.
