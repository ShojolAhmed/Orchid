# Spotify Web API usage (Prompt 5)

Checked 2026-10-11 against developer.spotify.com: the **February 2026 changelog** (development-mode restrictions), the March, May and July 2026 changelogs, and the reference pages for library, playlists and search. Re-check before changing anything; Spotify changes this API often.

## Access tier assumptions
Orchid is a development-mode app: owner needs Premium, at most 5 allowlisted users (Developer Dashboard > User Management), **search `limit` max 10 (default 5)**. A 403 usually means one of those rules, a missing scope, or data Spotify withholds. Spotify does not say which, so the UI lists the possibilities (`FORBIDDEN_EXPLANATION`).

## Endpoints used
| Purpose | Endpoint | Scope |
| --- | --- | --- |
| Search (tracks, albums, artists, playlists in one call) | `GET /search?type=track,album,artist,playlist&limit=10&offset=` | none (signed-in token) |
| Album + first tracks, more tracks | `GET /albums/{id}`, `GET /albums/{id}/tracks` | none |
| Artist, discography | `GET /artists/{id}`, `GET /artists/{id}/albums?include_groups=album,single,compilation` | none |
| Playlist (metadata + own playlists' items), more items | `GET /playlists/{id}`, `GET /playlists/{id}/items` | `playlist-read-private` (+ `-collaborative`) |
| My playlists | `GET /me/playlists` | `playlist-read-private`, `playlist-read-collaborative` |
| Saved tracks / albums | `GET /me/tracks`, `GET /me/albums` | `user-library-read` |
| Followed artists (read only) | `GET /me/following?type=artist` (cursor `after`) | `user-follow-read` |
| Is it saved? | `GET /me/library/contains?uris=` (max 40) | `user-library-read` (see caveat) |
| Save / remove | `PUT` / `DELETE /me/library?uris=` (max 40; tracks, albums) | `user-library-modify` (see caveat) |
| Create playlist | `POST /me/playlists` `{name, description, public}` (always private from the UI) | `playlist-modify-private` |
| Add tracks | `POST /playlists/{id}/items` `{uris}` (max 100) | `playlist-modify-private`, `playlist-modify-public` |
| Top artists | `GET /me/top/artists?time_range=medium_term&limit=10` | `user-top-read` |
| Recently played | `GET /me/player/recently-played?limit=50` | `user-read-recently-played` |
| New releases (substitute) | `GET /search?q=tag:new&type=album` | none |

Playback endpoints (transfer, play, queue, ...) are unchanged from Prompt 4 (`docs/PLAYBACK.md`).

## Scopes requested (13)
`streaming`, `user-modify-playback-state`, `user-read-email`, `user-read-private` (playback, Prompt 4) + `user-library-read`, `user-library-modify`, `playlist-read-private`, `playlist-read-collaborative`, `playlist-modify-private`, `playlist-modify-public`, `user-follow-read`, `user-top-read`, `user-read-recently-played`. Defined per feature in `features/auth/scopes.ts`; a test pins the exact list so it cannot widen silently. Existing sessions keep **playing** (the player checks only the playback scopes) but library features show "Reconnect Spotify".

## What Spotify no longer provides (so Orchid does not show it)
Recommendations, featured/editorial playlists, browse categories (Nov 2024); new-releases list, artist top tracks, batch "several X" lookups, other users' profiles/playlists, `popularity`, artist `followers`, `available_markets`, artist `genres` (empty), album `label` (Feb 2026). Home therefore has no "Made for you" or "Popular", Artist has no "Popular" tracks or listener count, Search has no category tiles (plain search shortcuts instead), and a playlist you don't own shows metadata and a Play button but no track list.

## Behaviour rules (in `features/api/client.ts`)
- 401: refresh the token **once**, retry once; a second 401 is `unauthorized` ("reconnect"). Never loops.
- 429: `reason: QUOTA_EXCEEDED` (July 2026) is never retried and starts a 30 s cooldown. Otherwise a `Retry-After` up to 3 s is waited out **once**; longer is reported with the seconds. After any 429 the client sends nothing until the cooldown ends.
- 5xx: one retry, GET only. Writes are never retried.
- Identical in-flight GETs share one request; successful GETs are cached 30 s; any write clears the cache; sign-out or account change resets everything.
- A cancelled caller cancels the network request when nobody else is waiting on it.

## Caveats and unverified points
- **Library scope mapping is inferred.** The save/remove/contains reference pages list `user-library-*`, `user-follow-*` and `playlist-*` scopes without saying which applies to which item type. For tracks and albums Orchid requests `user-library-read/modify`. If real Spotify answers 403 "Insufficient client scope" the UI says "Reconnect"; if reconnecting doesn't help, this is the first place to look.
- **Artists cannot be followed/unfollowed.** The official save page lists tracks, albums, episodes, shows, audiobooks, users and playlists, not artists (community reports say artists work). Orchid reads followed artists only.
- `tag:new` as a New-releases substitute relies on the documented search filter; **not verified live**. The shelf hides itself on error or empty.
- Playlist item field was renamed `track` -> `item` (Feb 2026); both are read. `GET /playlists/{id}` embedding `items` only for own playlists is from the changelog; if Spotify embeds nothing for an owned playlist, the service falls back to `/items`.
- Playlist artwork may come from hosts other than `i.scdn.co`; the CSP in `docs/AUTH.md` allows `https:` images. If you tighten it, keep those hosts.
- Liked Songs has no public context URI, so "play Liked Songs" plays the first 50 saved tracks as a list.
- **None of this ran against real Spotify.** The browser checks use a stub built from the changelog shapes.
