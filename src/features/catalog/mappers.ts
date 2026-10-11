import type {
  SpotifyAlbum,
  SpotifyArtist,
  SpotifyCursorPaging,
  SpotifyEpisodeLike,
  SpotifyImage,
  SpotifyPaging,
  SpotifyPlaylist,
  SpotifyPlaylistEntry,
  SpotifyRecentlyPlayedResponse,
  SpotifySimplifiedAlbum,
  SpotifySimplifiedArtist,
  SpotifySimplifiedPlaylist,
  SpotifySimplifiedTrack,
  SpotifyTrack,
} from '../api/models.ts'
import { hueFromString } from '../../lib/hue.ts'
import type { Album, AlbumType, Artist, ArtistRef, Page, Playlist, Track } from './types.ts'
import type { ArtworkSource } from '../../components/ui'

/**
 * Raw Spotify response -> domain objects. Every function here tolerates what Spotify really sends:
 * null list entries, missing images, missing artists, podcast episodes inside playlists, local files.
 * An item that cannot be shown or played returns `null` and is counted in `Page.skipped`.
 */

/** Spotify ids are 22 base-62 characters. Anything else cannot be played or linked to. */
const SPOTIFY_ID = /^[0-9A-Za-z]{22}$/

function validId(value: unknown): value is string {
  return typeof value === 'string' && SPOTIFY_ID.test(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function nonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null
}

/**
 * The smallest image that is at least `target` pixels wide, or else the largest one. Only https
 * images are used. Returns undefined when there is nothing usable, and the UI shows a gradient.
 */
export function pickImageUrl(images: SpotifyImage[] | null | undefined, target = 300): string | undefined {
  const usable = (images ?? []).filter((image): image is SpotifyImage & { url: string } => typeof image?.url === 'string' && image.url.startsWith('https://'))
  if (usable.length === 0) return undefined
  const sized = usable.filter((image): image is typeof image & { width: number } => typeof image.width === 'number')
  if (sized.length === 0) return usable[0]?.url
  const enough = sized.filter((image) => image.width >= target).sort((a, b) => a.width - b.width)[0]
  return (enough ?? [...sized].sort((a, b) => b.width - a.width)[0])?.url
}

export function toArtwork(images: SpotifyImage[] | null | undefined, seedKey: string): ArtworkSource {
  const imageUrl = pickImageUrl(images)
  return { seed: hueFromString(seedKey), ...(imageUrl ? { imageUrl } : {}) }
}

/** Spotify descriptions may contain HTML. The UI renders text only, so tags and entities are reduced to plain text. */
export function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function mapArtistRefs(artists: SpotifySimplifiedArtist[] | null | undefined): ArtistRef[] {
  return (artists ?? []).flatMap((artist) => {
    const name = text(artist?.name).trim()
    if (!name) return []
    return [{ id: validId(artist?.id) ? artist.id : '', name }]
  })
}

function parseYear(releaseDate: string | null): number | null {
  const match = releaseDate ? /^(\d{4})/.exec(releaseDate) : null
  return match ? Number(match[1]) : null
}

function albumTypeOf(value: string | null | undefined): AlbumType {
  return value === 'album' || value === 'single' || value === 'compilation' ? value : 'unknown'
}

export function mapAlbum(raw: SpotifySimplifiedAlbum | SpotifyAlbum | null | undefined): Album | null {
  if (!raw || !validId(raw.id)) return null
  const title = text(raw.name).trim()
  if (!title) return null
  const artists = mapArtistRefs(raw.artists)
  const releaseDate = text(raw.release_date) || null
  return {
    id: raw.id,
    uri: `spotify:album:${raw.id}`,
    title,
    artistId: artists[0]?.id ?? '',
    artistName: artists.map((artist) => artist.name).join(', ') || 'Unknown artist',
    year: parseYear(releaseDate),
    releaseDate,
    albumType: albumTypeOf(raw.album_type),
    totalTracks: count(raw.total_tracks),
    artwork: toArtwork(raw.images, raw.id),
  }
}

export function mapArtist(raw: SpotifyArtist | null | undefined): Artist | null {
  if (!raw || !validId(raw.id)) return null
  const name = text(raw.name).trim()
  if (!name) return null
  return {
    id: raw.id,
    uri: `spotify:artist:${raw.id}`,
    name,
    genres: (raw.genres ?? []).filter((genre): genre is string => typeof genre === 'string' && genre.length > 0),
    artwork: toArtwork(raw.images, raw.id),
  }
}

export function mapPlaylist(raw: SpotifySimplifiedPlaylist | SpotifyPlaylist | null | undefined): Playlist | null {
  if (!raw || !validId(raw.id)) return null
  const title = text(raw.name).trim()
  if (!title) return null
  const itemsRef = raw.items ?? raw.tracks
  return {
    id: raw.id,
    uri: `spotify:playlist:${raw.id}`,
    title,
    description: plainText(text(raw.description)),
    owner: text(raw.owner?.display_name).trim() || text(raw.owner?.id) || 'Spotify',
    ownerId: text(raw.owner?.id),
    collaborative: raw.collaborative === true,
    isPublic: typeof raw.public === 'boolean' ? raw.public : null,
    artwork: toArtwork(raw.images, raw.id),
    trackCount: count(itemsRef?.total),
  }
}

export interface AlbumContext {
  id: string
  title: string
  artwork: ArtworkSource
}

/**
 * A playable track, or null for anything else: podcast episodes, local files, deleted or unavailable
 * entries and objects without a valid id. `albumContext` fills in the album for tracks that come from
 * an album's own track list, where Spotify omits the `album` object.
 */
export function mapTrack(raw: SpotifyTrack | SpotifySimplifiedTrack | SpotifyEpisodeLike | null | undefined, albumContext?: AlbumContext): Track | null {
  if (!raw) return null
  if (raw.type !== undefined && raw.type !== 'track') return null
  const track = raw as SpotifyTrack
  if (track.is_local === true || !validId(track.id)) return null
  const title = text(track.name).trim()
  if (!title) return null

  const artists = mapArtistRefs(track.artists)
  const ownAlbum = 'album' in track ? track.album : null
  const album = ownAlbum && validId(ownAlbum.id) ? ownAlbum : null
  const artwork = album ? toArtwork(album.images, album.id as string) : (albumContext?.artwork ?? { seed: hueFromString(track.id) })

  return {
    id: track.id,
    uri: `spotify:track:${track.id}`,
    title,
    artistId: artists[0]?.id ?? '',
    artistName: artists.map((artist) => artist.name).join(', ') || 'Unknown artist',
    artists,
    albumId: album?.id ?? albumContext?.id ?? '',
    albumTitle: (album ? text(album.name).trim() : '') || albumContext?.title || '',
    trackNumber: nonNegative(track.track_number),
    durationMs: nonNegative(track.duration_ms),
    explicit: track.explicit === true,
    artwork,
  }
}

/** Offset paging. `next` is the offset of the following page as a string, or null at the end. */
export function mapOffsetPage<R, T>(paging: SpotifyPaging<R> | null | undefined, mapItem: (raw: R) => T | null, requestedOffset = 0): Page<T> {
  const rawItems = paging?.items ?? []
  const items: T[] = []
  let skipped = 0
  for (const raw of rawItems) {
    const mapped = raw === null || raw === undefined ? null : mapItem(raw)
    if (mapped === null) skipped += 1
    else items.push(mapped)
  }
  const offset = typeof paging?.offset === 'number' ? paging.offset : requestedOffset
  const hasMore = Boolean(paging?.next) && rawItems.length > 0
  return { items, total: count(paging?.total), next: hasMore ? String(offset + rawItems.length) : null, skipped }
}

/** Cursor paging (followed artists). `next` is Spotify's `after` cursor, or null at the end. */
export function mapCursorPage<R, T>(paging: SpotifyCursorPaging<R> | null | undefined, mapItem: (raw: R) => T | null): Page<T> {
  const rawItems = paging?.items ?? []
  const items: T[] = []
  let skipped = 0
  for (const raw of rawItems) {
    const mapped = raw === null || raw === undefined ? null : mapItem(raw)
    if (mapped === null) skipped += 1
    else items.push(mapped)
  }
  const after = paging?.cursors?.after
  return { items, total: count(paging?.total), next: paging?.next && typeof after === 'string' && after ? after : null, skipped }
}

/** An entry of a playlist's items: the February 2026 field is `item`; `track` is read as a fallback. */
export function mapPlaylistEntry(entry: SpotifyPlaylistEntry): Track | null {
  if (entry.is_local === true) return null
  return mapTrack(entry.item ?? entry.track ?? null)
}

/** Recently played tracks, newest first, each track once. */
export function mapPlayHistory(response: SpotifyRecentlyPlayedResponse | null | undefined): Track[] {
  const seen = new Set<string>()
  const tracks: Track[] = []
  for (const entry of response?.items ?? []) {
    const track = mapTrack(entry?.track)
    if (track && !seen.has(track.id)) {
      seen.add(track.id)
      tracks.push(track)
    }
  }
  return tracks
}

/**
 * The albums behind recently played tracks, most recent first, without duplicates. Built only from
 * real plays. Fields Spotify did not send with a play (release date, track count) are null, not guessed.
 */
export function albumsFromTracks(tracks: Track[]): Album[] {
  const seen = new Set<string>()
  const albums: Album[] = []
  for (const track of tracks) {
    if (!track.albumId || seen.has(track.albumId)) continue
    seen.add(track.albumId)
    albums.push({
      id: track.albumId,
      uri: `spotify:album:${track.albumId}`,
      title: track.albumTitle || 'Unknown album',
      artistId: track.artistId,
      artistName: track.artistName,
      year: null,
      releaseDate: null,
      albumType: 'unknown',
      totalTracks: null,
      artwork: track.artwork,
    })
  }
  return albums
}
