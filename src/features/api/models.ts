/**
 * Raw Spotify Web API response shapes, as of the February 2026 changelog (dev-mode apps) plus the March
 * and May 2026 revisions. These describe what arrives over the wire. They are deliberately loose: a
 * field Spotify may omit, null, or has removed (`popularity`, `followers`, `available_markets`, `genres`
 * on artists, `label`, ...) is optional or absent here, and `features/catalog/mappers.ts` turns these
 * into the app's own domain types. Nothing outside `features/api` and the mappers should import this.
 */

export interface SpotifyImage {
  url?: string | null
  width?: number | null
  height?: number | null
}

export interface SpotifySimplifiedArtist {
  id?: string | null
  uri?: string | null
  name?: string | null
  type?: string
}

export interface SpotifyArtist extends SpotifySimplifiedArtist {
  images?: SpotifyImage[] | null
  /** Spotify now returns an empty list. Kept optional in case it returns. */
  genres?: string[] | null
}

export type SpotifyReleaseDatePrecision = 'year' | 'month' | 'day'

export interface SpotifySimplifiedAlbum {
  id?: string | null
  uri?: string | null
  name?: string | null
  album_type?: string | null
  total_tracks?: number | null
  release_date?: string | null
  release_date_precision?: SpotifyReleaseDatePrecision | null
  images?: SpotifyImage[] | null
  artists?: SpotifySimplifiedArtist[] | null
  type?: string
}

export interface SpotifyAlbum extends SpotifySimplifiedAlbum {
  /** First page of the album's tracks. */
  tracks?: SpotifyPaging<SpotifySimplifiedTrack> | null
}

export interface SpotifySimplifiedTrack {
  id?: string | null
  uri?: string | null
  name?: string | null
  duration_ms?: number | null
  track_number?: number | null
  disc_number?: number | null
  explicit?: boolean | null
  is_local?: boolean | null
  is_playable?: boolean | null
  artists?: SpotifySimplifiedArtist[] | null
  type?: string
}

export interface SpotifyTrack extends SpotifySimplifiedTrack {
  album?: SpotifySimplifiedAlbum | null
}

export interface SpotifyEpisodeLike {
  id?: string | null
  uri?: string | null
  name?: string | null
  type?: 'episode'
}

export interface SpotifyOwner {
  id?: string | null
  display_name?: string | null
}

export interface SpotifyPlaylistItemsRef {
  total?: number | null
  href?: string | null
}

/** One entry of a playlist's items. The February 2026 rename is `track` -> `item`; both are read. */
export interface SpotifyPlaylistEntry {
  added_at?: string | null
  is_local?: boolean | null
  item?: SpotifyTrack | SpotifyEpisodeLike | null
  /** Pre-February name. Read as a fallback only. */
  track?: SpotifyTrack | SpotifyEpisodeLike | null
}

export interface SpotifySimplifiedPlaylist {
  id?: string | null
  uri?: string | null
  name?: string | null
  description?: string | null
  images?: SpotifyImage[] | null
  owner?: SpotifyOwner | null
  collaborative?: boolean | null
  public?: boolean | null
  /** Renamed from `tracks` in February 2026. Only a count and link for simplified playlists. */
  items?: SpotifyPlaylistItemsRef | null
  tracks?: SpotifyPlaylistItemsRef | null
  type?: string
}

/** Full playlist. `items` is a paging object only for the user's own (or collaborative) playlists. */
export interface SpotifyPlaylist extends Omit<SpotifySimplifiedPlaylist, 'items' | 'tracks'> {
  items?: SpotifyPaging<SpotifyPlaylistEntry> | SpotifyPlaylistItemsRef | null
  tracks?: SpotifyPaging<SpotifyPlaylistEntry> | SpotifyPlaylistItemsRef | null
}

export interface SpotifyPaging<T> {
  items?: Array<T | null> | null
  total?: number | null
  limit?: number | null
  offset?: number | null
  next?: string | null
  previous?: string | null
}

export interface SpotifyCursorPaging<T> {
  items?: Array<T | null> | null
  total?: number | null
  limit?: number | null
  next?: string | null
  cursors?: { after?: string | null } | null
}

export interface SpotifySearchResponse {
  tracks?: SpotifyPaging<SpotifyTrack> | null
  albums?: SpotifyPaging<SpotifySimplifiedAlbum> | null
  artists?: SpotifyPaging<SpotifyArtist> | null
  playlists?: SpotifyPaging<SpotifySimplifiedPlaylist> | null
}

export type SpotifySearchType = 'track' | 'album' | 'artist' | 'playlist'

export interface SpotifySavedTrackEntry {
  added_at?: string | null
  track?: SpotifyTrack | null
}

export interface SpotifySavedAlbumEntry {
  added_at?: string | null
  album?: SpotifyAlbum | null
}

export interface SpotifyFollowedArtistsResponse {
  artists?: SpotifyCursorPaging<SpotifyArtist> | null
}

export interface SpotifyPlayHistoryEntry {
  played_at?: string | null
  track?: SpotifyTrack | null
}

export interface SpotifyRecentlyPlayedResponse {
  items?: Array<SpotifyPlayHistoryEntry | null> | null
}
