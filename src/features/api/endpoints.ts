import type { SpotifyClient } from './client.ts'
import type {
  SpotifyAlbum,
  SpotifyArtist,
  SpotifyFollowedArtistsResponse,
  SpotifyPaging,
  SpotifyPlaylist,
  SpotifyPlaylistEntry,
  SpotifyRecentlyPlayedResponse,
  SpotifySavedAlbumEntry,
  SpotifySavedTrackEntry,
  SpotifySearchResponse,
  SpotifySearchType,
  SpotifySimplifiedAlbum,
  SpotifySimplifiedPlaylist,
  SpotifySimplifiedTrack,
} from './models.ts'

/**
 * One typed function per Spotify Web API endpoint the app uses. All of them were checked against
 * Spotify's February to July 2026 changelogs for development-mode apps (see docs/API.md). Nothing here
 * maps to domain types; that is `features/catalog/mappers.ts`.
 */

/** Largest `limit` for each family of endpoints. Search was cut from 50 to 10 in February 2026. */
export const LIMITS = { search: 10, page: 50, albumTracks: 50, recentlyPlayed: 50 } as const

/** `uris` on library endpoints is capped at 40 per request. */
export const LIBRARY_URIS_PER_REQUEST = 40
/** Add Items to Playlist accepts at most 100 URIs per request. */
export const PLAYLIST_URIS_PER_REQUEST = 100

/** The pieces of a path are ids that were validated by the caller; encode anyway so a stray character cannot change the route. */
const seg = (id: string) => encodeURIComponent(id)

interface Cancellable {
  signal?: AbortSignal
}

export function createSpotifyEndpoints(client: SpotifyClient) {
  return {
    search(query: string, types: readonly SpotifySearchType[], options: Cancellable & { limit?: number; offset?: number } = {}) {
      return client.get<SpotifySearchResponse>('/search', {
        query: { q: query.slice(0, 250), type: types.join(','), limit: Math.min(options.limit ?? LIMITS.search, LIMITS.search), offset: options.offset ?? 0 },
        ...(options.signal ? { signal: options.signal } : {}),
      })
    },

    getAlbum: (id: string, options: Cancellable = {}) => client.get<SpotifyAlbum>(`/albums/${seg(id)}`, options),

    getAlbumTracks: (id: string, offset: number, options: Cancellable = {}) =>
      client.get<SpotifyPaging<SpotifySimplifiedTrack>>(`/albums/${seg(id)}/tracks`, { query: { limit: LIMITS.albumTracks, offset }, ...options }),

    getArtist: (id: string, options: Cancellable = {}) => client.get<SpotifyArtist>(`/artists/${seg(id)}`, options),

    getArtistAlbums: (id: string, offset: number, options: Cancellable = {}) =>
      client.get<SpotifyPaging<SpotifySimplifiedAlbum>>(`/artists/${seg(id)}/albums`, { query: { include_groups: 'album,single,compilation', limit: LIMITS.page, offset }, ...options }),

    /** Full playlist. `items` (a paging object) is present only for playlists the user owns or collaborates on. */
    getPlaylist: (id: string, options: Cancellable = {}) => client.get<SpotifyPlaylist>(`/playlists/${seg(id)}`, options),

    getPlaylistItems: (id: string, offset: number, options: Cancellable = {}) =>
      client.get<SpotifyPaging<SpotifyPlaylistEntry>>(`/playlists/${seg(id)}/items`, { query: { limit: LIMITS.page, offset }, ...options }),

    getMyPlaylists: (offset: number, options: Cancellable = {}) => client.get<SpotifyPaging<SpotifySimplifiedPlaylist>>('/me/playlists', { query: { limit: LIMITS.page, offset }, ...options }),

    getSavedTracks: (offset: number, options: Cancellable = {}) => client.get<SpotifyPaging<SpotifySavedTrackEntry>>('/me/tracks', { query: { limit: LIMITS.page, offset }, ...options }),

    getSavedAlbums: (offset: number, options: Cancellable = {}) => client.get<SpotifyPaging<SpotifySavedAlbumEntry>>('/me/albums', { query: { limit: LIMITS.page, offset }, ...options }),

    getFollowedArtists: (after: string | null, options: Cancellable = {}) =>
      client.get<SpotifyFollowedArtistsResponse>('/me/following', { query: { type: 'artist', limit: LIMITS.page, after: after ?? undefined }, ...options }),

    getTopArtists: (limit: number, options: Cancellable = {}) =>
      client.get<SpotifyPaging<SpotifyArtist>>('/me/top/artists', { query: { limit, time_range: 'medium_term' }, ...options }),

    getRecentlyPlayed: (options: Cancellable = {}) => client.get<SpotifyRecentlyPlayedResponse>('/me/player/recently-played', { query: { limit: LIMITS.recentlyPlayed }, ...options }),

    /** Which of these (at most 40) URIs are saved. Returns one boolean per URI, in order. */
    libraryContains: (uris: readonly string[], options: Cancellable = {}) => client.get<boolean[]>('/me/library/contains', { query: { uris: uris.join(',') }, ...options }),

    /** Save at most 40 URIs (tracks, albums). The URIs travel as a query parameter, per Spotify's reference. */
    librarySave: (uris: readonly string[]) => client.put('/me/library', { query: { uris: uris.join(',') } }),

    libraryRemove: (uris: readonly string[]) => client.delete('/me/library', { query: { uris: uris.join(',') } }),

    createPlaylist: (name: string, description: string, isPublic: boolean) => client.post<SpotifySimplifiedPlaylist>('/me/playlists', { body: { name, description, public: isPublic } }),

    /** Appends tracks to a playlist the user owns or collaborates on. At most 100 URIs. */
    addPlaylistItems: (playlistId: string, uris: readonly string[]) => client.post<{ snapshot_id?: string }>(`/playlists/${seg(playlistId)}/items`, { body: { uris } }),
  }
}

export type SpotifyEndpoints = ReturnType<typeof createSpotifyEndpoints>
