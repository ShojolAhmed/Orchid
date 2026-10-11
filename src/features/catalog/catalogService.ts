import { SpotifyApiError, isSpotifyApiError } from '../api/errors.ts'
import { LIBRARY_URIS_PER_REQUEST, PLAYLIST_URIS_PER_REQUEST, type SpotifyEndpoints } from '../api/endpoints.ts'
import type { SpotifyPlaylist, SpotifyPlaylistEntry, SpotifyPaging } from '../api/models.ts'
import { albumsFromTracks, mapAlbum, mapArtist, mapCursorPage, mapOffsetPage, mapPlayHistory, mapPlaylist, mapPlaylistEntry, mapTrack, type AlbumContext } from './mappers.ts'
import {
  NotFoundError,
  type Album,
  type AlbumDetail,
  type Artist,
  type ArtistDetail,
  type PlayableCollection,
  type Page,
  type Playlist,
  type PlaylistDetail,
  type SearchKind,
  type SearchResults,
  type Track,
} from './types.ts'

/**
 * The only door to Spotify catalog and library data for the UI. It composes typed endpoint calls and maps
 * the raw responses to domain types. It never invents data: when Spotify does not provide something (top
 * tracks, recommendations, browse categories, another user's playlist tracks) there is no method for it.
 *
 * Built with an injected endpoint provider so it runs in Node tests; `catalog/service.ts` binds it to the
 * real client.
 */

const SPOTIFY_ID = /^[0-9A-Za-z]{22}$/
/** Spotify caps search `offset + limit` at 1,000. */
const SEARCH_WINDOW = 1000
const SEARCH_PAGE = 10
/** Album track lists are followed at most this many extra pages (50 tracks each). */
const ALBUM_EXTRA_PAGES = 4

export interface SignalOption {
  signal?: AbortSignal
}

interface SearchKindMap {
  tracks: Track
  albums: Album
  artists: Artist
  playlists: Playlist
}

function requireId(id: string, what: string): string {
  if (!SPOTIFY_ID.test(id)) throw new NotFoundError(what)
  return id
}

/** Spotify answers an unknown or malformed id with 404 or 400. Both mean "no such item" to the UI. */
async function orNotFound<T>(what: string, request: Promise<T>): Promise<T> {
  try {
    return await request
  } catch (error) {
    if (isSpotifyApiError(error) && (error.kind === 'not-found' || error.kind === 'bad-request')) throw new NotFoundError(what)
    throw error
  }
}

function offsetOf(cursor: string | null): number {
  const value = Number(cursor ?? 0)
  return Number.isInteger(value) && value >= 0 ? value : 0
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Spotify lists the same release more than once (editions, regional versions). Keep the first of each. */
function dedupeAlbums(albums: Album[]): Album[] {
  const seen = new Set<string>()
  return albums.filter((album) => {
    const key = `${album.title.toLowerCase()}|${album.releaseDate ?? ''}|${album.totalTracks ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const SAVABLE_URI = /^spotify:(track|album):[0-9A-Za-z]{22}$/

function isPaging<T>(value: unknown): value is SpotifyPaging<T> {
  return typeof value === 'object' && value !== null && Array.isArray((value as { items?: unknown }).items)
}

export function createCatalogService(getApi: () => SpotifyEndpoints) {
  const searchNext = (offset: number, returned: number): string | null => (returned >= SEARCH_PAGE && offset + SEARCH_PAGE * 2 <= SEARCH_WINDOW ? String(offset + SEARCH_PAGE) : null)

  const service = {
    /** One request for all four result kinds. `limit` is 10 per kind, Spotify's maximum for this app tier. */
    async search(query: string, options: SignalOption = {}): Promise<SearchResults> {
      const q = query.trim()
      const raw = await getApi().search(q, ['track', 'album', 'artist', 'playlist'], { limit: SEARCH_PAGE, offset: 0, ...options })
      const withNext = <T>(page: Page<T>, returned: number): Page<T> => ({ ...page, next: searchNext(0, returned) })
      return {
        query: q,
        tracks: withNext(mapOffsetPage(raw.tracks, (item) => mapTrack(item)), raw.tracks?.items?.length ?? 0),
        albums: withNext(mapOffsetPage(raw.albums, mapAlbum), raw.albums?.items?.length ?? 0),
        artists: withNext(mapOffsetPage(raw.artists, mapArtist), raw.artists?.items?.length ?? 0),
        playlists: withNext(mapOffsetPage(raw.playlists, mapPlaylist), raw.playlists?.items?.length ?? 0),
      }
    },

    /** The next page of one kind, for the "Show more" button of a filtered search. `cursor` comes from the previous page. */
    async searchMore<K extends SearchKind>(query: string, kind: K, cursor: string, options: SignalOption = {}): Promise<Page<SearchKindMap[K]>> {
      const offset = offsetOf(cursor)
      const type = kind === 'tracks' ? 'track' : kind === 'albums' ? 'album' : kind === 'artists' ? 'artist' : 'playlist'
      const raw = await getApi().search(query.trim(), [type], { limit: SEARCH_PAGE, offset, ...options })
      const paging = raw[kind] ?? null
      const returned = paging?.items?.length ?? 0
      const page =
        kind === 'tracks'
          ? mapOffsetPage(raw.tracks, (item) => mapTrack(item), offset)
          : kind === 'albums'
            ? mapOffsetPage(raw.albums, mapAlbum, offset)
            : kind === 'artists'
              ? mapOffsetPage(raw.artists, mapArtist, offset)
              : mapOffsetPage(raw.playlists, mapPlaylist, offset)
      return { ...page, next: searchNext(offset, returned) } as Page<SearchKindMap[K]>
    },

    async getAlbum(id: string, options: SignalOption = {}): Promise<AlbumDetail> {
      requireId(id, 'Album')
      const raw = await orNotFound('Album', getApi().getAlbum(id, options))
      const album = mapAlbum(raw)
      if (!album) throw new NotFoundError('Album')
      const context: AlbumContext = { id: album.id, title: album.title, artwork: album.artwork }
      const toTrack = (item: Parameters<typeof mapTrack>[0]) => mapTrack(item, context)

      let page = mapOffsetPage(raw.tracks, toTrack)
      const tracks = [...page.items]
      for (let extra = 0; page.next && extra < ALBUM_EXTRA_PAGES; extra += 1) {
        const offset = offsetOf(page.next)
        page = mapOffsetPage(await getApi().getAlbumTracks(id, offset, options), toTrack, offset)
        tracks.push(...page.items)
      }
      return { album, tracks, tracksComplete: page.next === null }
    },

    async getArtist(id: string, options: SignalOption = {}): Promise<ArtistDetail> {
      requireId(id, 'Artist')
      const [rawArtist, rawAlbums] = await Promise.all([orNotFound('Artist', getApi().getArtist(id, options)), orNotFound('Artist', getApi().getArtistAlbums(id, 0, options))])
      const artist = mapArtist(rawArtist)
      if (!artist) throw new NotFoundError('Artist')
      const page = mapOffsetPage(rawAlbums, mapAlbum)
      return { artist, albums: { ...page, items: dedupeAlbums(page.items) } }
    },

    async getArtistAlbums(id: string, cursor: string, options: SignalOption = {}): Promise<Page<Album>> {
      requireId(id, 'Artist')
      const offset = offsetOf(cursor)
      const page = mapOffsetPage(await getApi().getArtistAlbums(id, offset, options), mapAlbum, offset)
      return { ...page, items: dedupeAlbums(page.items) }
    },

    /**
     * Playlist metadata plus its tracks when Spotify shares them. `viewerId` (the signed-in user's id, when known)
     * avoids a request that is certain to be refused: tracks are only available for playlists the viewer owns or collaborates on.
     */
    async getPlaylist(id: string, viewerId: string | null, options: SignalOption = {}): Promise<PlaylistDetail> {
      requireId(id, 'Playlist')
      const raw: SpotifyPlaylist = await orNotFound('Playlist', getApi().getPlaylist(id, options))
      const playlist = mapPlaylist(raw)
      if (!playlist) throw new NotFoundError('Playlist')

      const embedded = raw.items ?? raw.tracks
      if (isPaging<SpotifyPlaylistEntry>(embedded)) {
        return { playlist, tracks: mapOffsetPage(embedded, mapPlaylistEntry), restriction: null }
      }
      const mayRead = playlist.collaborative || viewerId === null || playlist.ownerId === viewerId
      if (!mayRead) return { playlist, tracks: null, restriction: 'tracks-not-shared' }
      try {
        return { playlist, tracks: mapOffsetPage(await getApi().getPlaylistItems(id, 0, options), mapPlaylistEntry), restriction: null }
      } catch (error) {
        if (isSpotifyApiError(error) && (error.kind === 'forbidden' || error.kind === 'not-found')) return { playlist, tracks: null, restriction: 'tracks-not-shared' }
        throw error
      }
    },

    async getPlaylistTracks(id: string, cursor: string, options: SignalOption = {}): Promise<Page<Track>> {
      requireId(id, 'Playlist')
      const offset = offsetOf(cursor)
      return mapOffsetPage(await getApi().getPlaylistItems(id, offset, options), mapPlaylistEntry, offset)
    },

    async getMyPlaylists(cursor: string | null = null, options: SignalOption = {}): Promise<Page<Playlist>> {
      const offset = offsetOf(cursor)
      return mapOffsetPage(await getApi().getMyPlaylists(offset, options), mapPlaylist, offset)
    },

    async getSavedTracks(cursor: string | null = null, options: SignalOption = {}): Promise<Page<Track>> {
      const offset = offsetOf(cursor)
      return mapOffsetPage(await getApi().getSavedTracks(offset, options), (entry) => mapTrack(entry.track), offset)
    },

    async getSavedAlbums(cursor: string | null = null, options: SignalOption = {}): Promise<Page<Album>> {
      const offset = offsetOf(cursor)
      return mapOffsetPage(await getApi().getSavedAlbums(offset, options), (entry) => mapAlbum(entry.album), offset)
    },

    async getFollowedArtists(cursor: string | null = null, options: SignalOption = {}): Promise<Page<Artist>> {
      const raw = await getApi().getFollowedArtists(cursor, options)
      return mapCursorPage(raw.artists, mapArtist)
    },

    /** Spotify's own "top artists" for this account (about the last six months). Empty for a new account. */
    async getTopArtists(options: SignalOption = {}): Promise<Artist[]> {
      return mapOffsetPage(await getApi().getTopArtists(10, options), mapArtist).items
    },

    /** Tracks this account played recently, newest first. Real history only; Spotify keeps about the last 50. */
    async getRecentlyPlayed(options: SignalOption = {}): Promise<Track[]> {
      return mapPlayHistory(await getApi().getRecentlyPlayed(options))
    },

    /** Albums behind the recently played tracks, newest first. */
    async getRecentlyPlayedAlbums(options: SignalOption = {}): Promise<Album[]> {
      return albumsFromTracks(await service.getRecentlyPlayed(options)).slice(0, 12)
    },

    /**
     * Newly released albums. Spotify removed its New Releases endpoint, so this is a catalog search with the
     * documented `tag:new` filter (albums from roughly the last two weeks). It is the same for every user.
     */
    async getNewReleases(options: SignalOption = {}): Promise<Album[]> {
      const raw = await getApi().search('tag:new', ['album'], { limit: SEARCH_PAGE, offset: 0, ...options })
      return mapOffsetPage(raw.albums, mapAlbum).items
    },

    /** Whether each URI (tracks and albums only) is in the user's Spotify library, in order. */
    async checkSaved(uris: readonly string[], options: SignalOption = {}): Promise<boolean[]> {
      assertSavable(uris)
      const groups = await Promise.all(chunk(uris, LIBRARY_URIS_PER_REQUEST).map((group) => getApi().libraryContains(group, options)))
      const flat = groups.flat()
      if (flat.length !== uris.length || flat.some((value) => typeof value !== 'boolean')) throw new SpotifyApiError('malformed')
      return flat
    },

    /** Saves to or removes from the user's Spotify library. Resolves only when Spotify confirmed it. */
    async setSaved(uris: readonly string[], saved: boolean): Promise<void> {
      assertSavable(uris)
      for (const group of chunk(uris, LIBRARY_URIS_PER_REQUEST)) {
        await (saved ? getApi().librarySave(group) : getApi().libraryRemove(group))
      }
    },

    /** Creates an empty playlist owned by the user. Private by default. */
    async createPlaylist(input: { name: string; description?: string; isPublic?: boolean }): Promise<Playlist> {
      const name = input.name.trim()
      if (!name) throw new SpotifyApiError('bad-request')
      const created = mapPlaylist(await getApi().createPlaylist(name, (input.description ?? '').trim(), input.isPublic === true))
      if (!created) throw new SpotifyApiError('malformed')
      return created
    },

    async addTracksToPlaylist(playlistId: string, trackUris: readonly string[]): Promise<void> {
      requireId(playlistId, 'Playlist')
      if (trackUris.length === 0) return
      assertTrackUris(trackUris)
      for (const group of chunk(trackUris, PLAYLIST_URIS_PER_REQUEST)) await getApi().addPlaylistItems(playlistId, group)
    },

    /**
     * The user's saved songs as something playable. Spotify has no context URI for Liked Songs in the public API, so
     * playback is started from the loaded tracks (the first page), not from a context.
     */
    async getLikedPlayable(): Promise<PlayableCollection> {
      const page = await service.getSavedTracks(null)
      return { id: 'liked', label: 'Liked Songs', tracks: page.items }
    },
  }
  return service
}

function assertSavable(uris: readonly string[]) {
  if (uris.length === 0 || uris.some((uri) => !SAVABLE_URI.test(uri))) throw new SpotifyApiError('bad-request')
}

function assertTrackUris(uris: readonly string[]) {
  if (uris.some((uri) => !/^spotify:track:[0-9A-Za-z]{22}$/.test(uri))) throw new SpotifyApiError('bad-request')
}

export type CatalogService = ReturnType<typeof createCatalogService>
