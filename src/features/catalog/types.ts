import type { ArtworkSource } from '../../components/ui'

/**
 * Domain types: what the UI works with. They are built from real Spotify responses by `mappers.ts`.
 * Spotify no longer provides some data to apps in development mode (artist followers and popularity,
 * track popularity, top tracks, artist genres), so those fields do not exist here rather than being
 * invented. Anything optional is genuinely optional: Spotify omits it for some items.
 */

export interface ArtistRef {
  id: string
  name: string
}

export interface Artist {
  id: string
  uri: string
  name: string
  /** Spotify currently returns an empty list; kept because the field may come back. */
  genres: string[]
  artwork: ArtworkSource
}

export interface Track {
  id: string
  /** Canonical Spotify URI (`spotify:track:<id>`). Set for real tracks; absent only when Spotify gave no usable id. */
  uri?: string
  title: string
  /** First credited artist. Empty when Spotify gave none (the UI then shows no artist link). */
  artistId: string
  /** All credited artists joined with ", ". */
  artistName: string
  artists?: ArtistRef[]
  /** Empty when the track came without album info. */
  albumId: string
  albumTitle: string
  trackNumber: number
  durationMs: number
  explicit?: boolean
  artwork: ArtworkSource
}

export type AlbumType = 'album' | 'single' | 'compilation' | 'unknown'

export interface Album {
  id: string
  uri: string
  title: string
  artistId: string
  artistName: string
  /** Null when Spotify gave no release date. */
  year: number | null
  /** As Spotify sent it: `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. */
  releaseDate: string | null
  albumType: AlbumType
  totalTracks: number | null
  artwork: ArtworkSource
}

export interface Playlist {
  id: string
  uri: string
  title: string
  description: string
  owner: string
  ownerId: string
  collaborative: boolean
  /** Null means Spotify did not say (it reports null for playlists where visibility is not relevant). */
  isPublic: boolean | null
  artwork: ArtworkSource
  /** Null when Spotify did not report a count. */
  trackCount: number | null
}

export type CollectionKind = 'album' | 'playlist' | 'liked'

/** A playable group of tracks plus the label shown as "Playing from ...". */
export interface PlayableCollection {
  id: string
  label: string
  /** Empty when playback is started from `contextUri` alone (Spotify queues the whole album, playlist or artist). */
  tracks: Track[]
  /** Spotify context URI (`spotify:album:<id>` and so on). Absent for lists with no Spotify context (search results, liked songs). */
  contextUri?: string
}

/**
 * One page of results. `next` is an opaque cursor to pass back to the same loader (an offset or a
 * Spotify cursor); null means there is nothing more. `skipped` counts items Spotify returned that the
 * app cannot show or play (podcast episodes, local files, deleted tracks), so the UI can say so.
 */
export interface Page<T> {
  items: T[]
  total: number | null
  next: string | null
  skipped: number
}

export interface SearchResults {
  query: string
  tracks: Page<Track>
  albums: Page<Album>
  artists: Page<Artist>
  playlists: Page<Playlist>
}

export type SearchKind = 'tracks' | 'albums' | 'artists' | 'playlists'

export interface AlbumDetail {
  album: Album
  tracks: Track[]
  /** False when the album has more tracks than the app loaded (very long compilations). */
  tracksComplete: boolean
}

export interface ArtistDetail {
  artist: Artist
  albums: Page<Album>
}

/**
 * Spotify only shares a playlist's tracks with apps in development mode when the user owns the
 * playlist or collaborates on it. `tracks` is null (and `restriction` set) for every other playlist.
 */
export type PlaylistRestriction = 'tracks-not-shared'

export interface PlaylistDetail {
  playlist: Playlist
  tracks: Page<Track> | null
  restriction: PlaylistRestriction | null
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} was not found`)
    this.name = 'NotFoundError'
  }
}
