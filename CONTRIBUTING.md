# Contributing

Orchid is a small personal project; focused fixes are welcome.

1. Use Node 22.18 or newer (`.nvmrc` says 22) and `npm ci`.
2. Read `docs/ARCHITECTURE.md`. Key rules: all Spotify data goes through `catalogService` / `features/api/client.ts`, all playback through `PlayerApi`, and the UI never fabricates data Spotify does not provide.
3. Before opening a pull request run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` (the same checks CI runs). For UI or flow changes also run the browser tests in `docs/TESTING.md`.
4. Never commit `.env` files, tokens or a client secret. Registering your own Spotify app (and its limits) is described in the README.
