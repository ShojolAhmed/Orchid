# Testing

| Check | Command | Needs |
| --- | --- | --- |
| Lint | `npm run lint` | |
| Type check (src and tests) | `npm run typecheck` | |
| Unit tests (Node's built-in runner, 196 tests) | `npm test` | Node 22.18+ (runs `.ts` directly) |
| Production build | `npm run build` | |
| Browser smoke tests (67 checks) | `python3 tests/e2e/smoke.py` | Python 3, Playwright for Python with Chromium, a running dev or preview server |

The first four run in CI (`.github/workflows/ci.yml`). The browser tests are not in CI yet.

## What the tests prove, and what they do not
Everything runs against **stubbed Spotify responses** (`tests/e2e/stub_spotify.py` for the browser, injected fakes for Node). The stub is built from Spotify's published changelogs, so the tests show Orchid handles those shapes. They do not show that Spotify behaves as documented. **Nothing has been run against real Spotify**, and the Web Playback SDK is blocked in the browser tests, so real audio and card-triggered context playback are untested (only the request builder is unit-tested).

## Running the browser tests
```bash
pip install playwright && python3 -m playwright install chromium

# Terminal 1: a server pinned to 127.0.0.1:5173 with throwaway values (nothing real is needed)
VITE_SPOTIFY_CLIENT_ID=testclient VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/callback npm run dev
#   or test the production bundle: build with the same variables, then `npm run preview`

# Terminal 2
python3 tests/e2e/smoke.py
```
The script prints PASS or FAIL per check and exits non-zero on any failure. It covers sign-in states, search, album/artist/playlist pages, library reads and writes, the add-to-playlist keyboard flow, reconnect gating, and horizontal overflow at 1440, 900 and 390 px.

## Not covered
Real Spotify accounts, real audio, screen readers, very large libraries, real rate-limit behaviour, and a deployed site.
