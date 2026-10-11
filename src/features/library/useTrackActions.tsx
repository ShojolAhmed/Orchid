import type { ReactNode } from 'react'
import { SaveButton, type TrackRowData } from '../../components/ui'
import { useFeatureAccess } from '../auth'
import type { Track } from '../catalog'
import { AddToPlaylist } from './AddToPlaylist'
import { useSavedActions } from './useSavedActions'

/**
 * Per-row extras for a `TrackList`: save to Your Library (a heart) and add to a playlist. Each appears only when
 * the session holds the permission it needs, and rows without a real Spotify URI get neither.
 */
export function useTrackActions(tracks: readonly Track[]): (row: TrackRowData) => ReactNode {
  const uris = tracks.flatMap((track) => (track.uri ? [track.uri] : []))
  const saved = useSavedActions(uris)
  const playlistsAccess = useFeatureAccess('playlists')

  return (row) => {
    if (!row.uri) return null
    return (
      <>
        {saved.available ? <SaveButton subject={row.title} saved={saved.isSaved(row.uri)} busy={saved.isPending(row.uri)} onToggle={() => saved.toggleWithNotice(row.uri as string, row.title)} /> : null}
        {playlistsAccess.status === 'granted' ? <AddToPlaylist trackUri={row.uri} trackTitle={row.title} /> : null}
      </>
    )
  }
}
