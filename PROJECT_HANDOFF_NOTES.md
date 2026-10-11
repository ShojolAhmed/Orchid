# PROJECT HANDOFF NOTES: end of Prompt 6 (final polish, audit, GitHub and deployment readiness)

Project: **Orchid** (prompts say MAGENTA). Read `PROJECT_CONTEXT.md`, `README.md`, then `docs/API.md`, `docs/AUTH.md`, `docs/PLAYBACK.md`, `docs/TESTING.md`.

## State
Phases 1 to 6 done in code. `npm run lint` 0/0, `npm run typecheck` clean (src and tests), `npm test` 196 pass, `npm run build` ok, `python3 tests/e2e/smoke.py` 67/67 in real Chromium. **All against stubbed Spotify. Nothing has been run against a real account, real audio, a screen reader, or a live deployment.**

## Phase 6 changes
- Home "Setup status" diagnostics now render only in dev builds; the useful "Play a Spotify link" form stays. Its stale "sample catalog" text was fixed.
- `playbackMessages.sampleTrack` became `noPlayableUri` with accurate wording (test updated).
- Accessibility bugs fixed: Escape in a popover now returns focus to the trigger (`useDismiss` passes a reason; pointer dismissals do not steal focus); playlist options use `aria-disabled` instead of `disabled` so focus is not lost mid-request; Create returns focus to its input. 7 regression checks added to `smoke.py`.
- Added: `typecheck` script + `tsconfig.tests.json`, `engines` (node >=22.18) + `.nvmrc`, `.gitignore` rewrite, `.editorconfig`, `.gitattributes`, `vercel.json`, CI workflow, SECURITY/CONTRIBUTING/TESTING docs, README rewrite. Stale docs (AUTH scopes, PLAYBACK eligibility/sample data) corrected.
- Lockfile: only the root `engines` entry changed; no dependency changed.

## Security audit result
No secrets or credential-like literals, no `.env` shipped, no client-secret references, `npm audit` 0, bundle clean, no `console.*`. Risk accepted and documented: refresh token in `localStorage`.

## Decisions pending for the owner
1. **LICENSE:** none chosen; none created.
2. **GitHub:** repository not created; nothing committed or pushed (the zip had no `.git`).
3. **Production "Play a Spotify link" form:** kept; remove if unwanted.
4. **CSP:** shipped Report-Only. Switch to enforcing after a real playback run shows no violations.
5. **Browser tests in CI:** not wired (unverified on a runner).
6. 13 requested scopes is broad; playlist-write and `user-follow-read` could be dropped (scope test pins the list).

## Spotify facts (checked October 2026)
Premium app owner required; 5 allowlisted users (others get 403 on API calls); extended quota is organizations only (~250k MAU); redirect URIs HTTPS or loopback IP literal, never `localhost`; dev-mode apps share a quota (429 `QUOTA_EXCEEDED`). A secondary source claimed a changed client-ID limit that conflicts with others; not documented.

## First real run checklist
`.env.local` with your client ID, `npm run dev`, Reconnect (expect 13 scopes). Check: Home shelves, search (one `/search` per pause), open an album, play a card (does the context start?), heart a track and confirm in the Spotify app, add to playlist, create one, someone else's playlist, 403 text for a non-allowlisted user, console for SDK/CSP messages. Any 403 on a library call: first suspect scope mapping (record in `docs/API.md`).

## Future improvements (priority order)
1. Real-account run and fixes. 2. Screen-reader pass. 3. Enforce CSP. 4. Browser tests in CI. 5. Route-level code splitting (bundle 468 kB JS, 147 kB gzip). 6. Heart on player bar, dedicated Liked Songs route. 7. Spotify branding/policy review before any public launch.
