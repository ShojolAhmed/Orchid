# Spotify authentication

Authorization Code flow with PKCE for a public browser client, per
[Spotify's PKCE guide](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow). The implicit grant is deprecated and is not used. No client secret exists anywhere in the project.

## Flow
1. **Connect**: `login()` validates configuration, creates a random code verifier (64 random bytes, base64url) and `state` (32 bytes), computes `code_challenge = BASE64URL(SHA-256(verifier))`, saves `{state, verifier, returnTo, createdAt}` in `sessionStorage`, then navigates to `accounts.spotify.com/authorize` with `code_challenge_method=S256`.
2. **Callback** (`/callback`, `pages/AuthCallback.tsx`): `handleCallback(search)` takes the saved attempt out of storage (one-time use), then checks in order: configuration; attempt exists; attempt younger than 10 minutes (our limit); `state` equals the saved state; `error` param (`access_denied` is reported as a cancellation); `code` present. Only then does it POST the code, verifier, `client_id` and exact `redirect_uri` to `/api/token`.
3. **Success**: access token kept in memory; refresh token (if issued) saved in `localStorage`; the URL is replaced with the page the user started on so the code never stays in history.
4. **Restore**: on load, a saved refresh token is exchanged (`grant_type=refresh_token`, `client_id`, no secret) for a new access token.
5. **Refresh**: `getAccessToken()` returns the cached token until shortly before `expires_in` elapses (margin: 60 s or half the lifetime, whichever is smaller; our own choice), then refreshes. One refresh at a time per tab (shared promise) and across tabs (Web Locks `orchid.spotify.refresh`; inside the lock the latest stored token is re-read, so a token rotated by another tab is used rather than reused).
6. **Logout**: clears memory, `localStorage` and any pending attempt, and ignores any request still in flight. Other tabs follow via the `storage` event. Spotify has no endpoint to revoke a token from a browser client; users can remove Orchid at spotify.com/account/apps.

## Token handling and risks
| Credential | Where | Why / risk |
| --- | --- | --- |
| Access token | JS memory only | Lifetime comes from Spotify's `expires_in` (documented as 1 hour; the code does not assume it). Lost on reload, then re-obtained via refresh. |
| Refresh token | `localStorage` (`orchid.spotify.credentials.v1`) | Needed so a reload or new tab does not force a new login. **Any script running on this origin (XSS) can read it**, and it lasts up to 6 months per Spotify. Mitigations: no third-party scripts (the only external script is Spotify's SDK), strict CSP below, `localStorage` holds nothing else sensitive, logout deletes it, and rotation is honoured. |
| PKCE verifier, `state` | `sessionStorage`, per tab | Only between leaving for Spotify and returning; deleted on first read; 10-minute limit. |

Behaviours that follow Spotify's documentation: a refresh response may omit a new refresh token (the existing one is kept); `invalid_grant` means the refresh token is expired or revoked, so it is discarded and the user must sign in again (no retry loop); the refresh token lifetime is 6 months from authorization and refreshing does not extend it. Nothing is assumed beyond that: a missing refresh token on sign-in gives a memory-only session that ends with the access token; a token response without `scope` is treated as granting nothing.

Nothing in `features/auth` logs. A test fails if any source file contains a `console.` call or a client-secret reference.

## Scopes
Requested per implemented feature (`features/auth/scopes.ts`). The full list (13 scopes across profile, playback, library, playlists, following and personalization) lives in `FEATURE_SCOPES` and is described in `docs/API.md`; profile display itself needs none. The session records the scopes Spotify reports as granted and exposes `missingScopes`; when a later phase enables a feature that needs more, the account menu offers **Reconnect**. `streaming` and `user-modify-playback-state` are confirmed by Spotify's scopes page. The two `user-read-*` scopes are not in the SDK docs and are kept because community reports of "Invalid token scopes" name them; try dropping them on a real account.

## Content-Security-Policy starting point (production, set as a header)
```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;
font-src 'self'; connect-src 'self' https://accounts.spotify.com https://api.spotify.com;
frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```
See docs/PLAYBACK.md for the SDK additions (`https://sdk.scdn.co` and Spotify streaming hosts). Avoid third-party analytics or widgets on this origin. Not set via `<meta>` because Vite's dev server injects inline scripts.

## Using it from feature code
```ts
const { actions } = useAuth()          // inside React
const token = await actions.getAccessToken()   // throws AuthRequiredError if there is no session
// on a 401 response: actions.invalidateAccessToken(), then call getAccessToken() once more
```
Outside React use `getSpotifySession()` from `features/auth/instance`.
