import { useEffect, useState } from 'react'
import { useFeatureAccess, useProfileSettled, useViewerId, type Access } from '../auth'
import { usePagedResource, useResource, type PagedResource, type Resource } from '../../lib/useResource'
import { catalogService } from './service'
import type { Album, Artist, ArtistDetail, AlbumDetail, Page, Playlist, PlaylistDetail, SearchKind, SearchResults, Track } from './types'

/**
 * Data hooks for the pages. Each one knows which permission its Spotify endpoint needs, makes no request
 * until the session has it, and returns the `access` it found so the page can say what to do next.
 */

export type Gated<T> = Resource<T> & { access: Access }
export type GatedPaged<T> = PagedResource<T> & { access: Access }

const granted = (access: Access) => access.status === 'granted'

/** Debounces `value` so typing does not fire a request per keystroke. */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

/** Search needs a signed-in session but no scope. An empty query makes no request. */
export function useSearch(query: string): Gated<SearchResults> {
  const access = useFeatureAccess('profile')
  const q = query.trim()
  const resource = useResource((signal) => catalogService.search(q, { signal }), [q], granted(access) && q.length > 0)
  return { ...resource, access }
}

export function useAlbum(id: string): Gated<AlbumDetail> {
  const access = useFeatureAccess('profile')
  return { ...useResource((signal) => catalogService.getAlbum(id, { signal }), [id], granted(access)), access }
}

export function useArtist(id: string): Gated<ArtistDetail> {
  const access = useFeatureAccess('profile')
  return { ...useResource((signal) => catalogService.getArtist(id, { signal }), [id], granted(access)), access }
}

export function usePlaylist(id: string): Gated<PlaylistDetail> {
  const access = useFeatureAccess('profile')
  const viewerId = useViewerId()
  // Whether the playlist is the viewer's decides if its tracks can be requested, so wait for the profile.
  const profileSettled = useProfileSettled()
  return { ...useResource((signal) => catalogService.getPlaylist(id, viewerId, { signal }), [id, viewerId], granted(access) && profileSettled), access }
}

/** More tracks of a playlist, after the first page that `usePlaylist` returned. */
export function usePlaylistMoreTracks(id: string, firstPage: Page<Track> | null) {
  const [extra, setExtra] = useState<{ id: string; tracks: Track[]; next: string | null; loading: boolean; error: Error | null }>({ id, tracks: [], next: firstPage?.next ?? null, loading: false, error: null })
  const current = extra.id === id ? extra : { id, tracks: [], next: firstPage?.next ?? null, loading: false, error: null }

  function loadMore() {
    if (current.next === null || current.loading) return
    const cursor = current.next
    setExtra({ ...current, loading: true, error: null })
    catalogService.getPlaylistTracks(id, cursor).then(
      (page) => setExtra((prev) => ({ id, tracks: [...(prev.id === id ? prev.tracks : []), ...page.items], next: page.next, loading: false, error: null })),
      (error: unknown) => setExtra((prev) => ({ ...(prev.id === id ? prev : current), loading: false, error: error instanceof Error ? error : new Error(String(error)) })),
    )
  }
  return { tracks: current.tracks, hasMore: current.next !== null, loading: current.loading, error: current.error, loadMore }
}

export function useArtistAlbums(id: string, firstPage: Page<Album>): PagedResource<Album> {
  // The first page arrives with the artist; later pages are loaded on demand starting from its cursor.
  return usePagedResource(
    async (cursor, signal) => (cursor === null ? firstPage : catalogService.getArtistAlbums(id, cursor, { signal })),
    (album) => album.id,
    [id],
    true,
  )
}

/** The signed-in user's playlists. Private and collaborative ones need their own scopes (see `scopes.ts`). */
export function useMyPlaylists(enabled = true): GatedPaged<Playlist> {
  const access = useFeatureAccess('playlists')
  return { ...usePagedResource((cursor, signal) => catalogService.getMyPlaylists(cursor, { signal }), (playlist) => playlist.id, [], granted(access) && enabled), access }
}

export function useSavedTracks(): GatedPaged<Track> {
  const access = useFeatureAccess('library')
  return { ...usePagedResource((cursor, signal) => catalogService.getSavedTracks(cursor, { signal }), (track) => track.id, [], granted(access)), access }
}

export function useSavedAlbums(): GatedPaged<Album> {
  const access = useFeatureAccess('library')
  return { ...usePagedResource((cursor, signal) => catalogService.getSavedAlbums(cursor, { signal }), (album) => album.id, [], granted(access)), access }
}

export function useFollowedArtists(): GatedPaged<Artist> {
  const access = useFeatureAccess('following')
  return { ...usePagedResource((cursor, signal) => catalogService.getFollowedArtists(cursor, { signal }), (artist) => artist.id, [], granted(access)), access }
}

export function useTopArtists(): Gated<Artist[]> {
  const access = useFeatureAccess('personalization')
  return { ...useResource((signal) => catalogService.getTopArtists({ signal }), [], granted(access)), access }
}

export function useRecentlyPlayedAlbums(): Gated<Album[]> {
  const access = useFeatureAccess('personalization')
  return { ...useResource((signal) => catalogService.getRecentlyPlayedAlbums({ signal }), [], granted(access)), access }
}

export function useNewReleases(): Gated<Album[]> {
  const access = useFeatureAccess('profile')
  return { ...useResource((signal) => catalogService.getNewReleases({ signal }), [], granted(access)), access }
}

export type { SearchKind }
