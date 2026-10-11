import { useCallback } from 'react'
import { catalogService, type CollectionKind } from '../catalog'
import { usePlayer } from './PlayerContext'

/** Context ids are what the player reports back for what is playing, so cards can show a pause icon. */
export function collectionContextId(kind: CollectionKind | 'artist', id: string): string {
  return kind === 'liked' ? 'liked' : `${kind}:${id}`
}

/**
 * Play or pause a whole album, playlist, artist or the liked songs from a card or header. Albums, playlists
 * and artists start from their Spotify context URI, so Spotify queues the whole thing and nothing is fetched
 * first. Liked Songs has no public context URI, so the first page of saved tracks is played as a list.
 */
export function usePlayCollection() {
  const { state, actions } = usePlayer()
  const { contextId: activeContext, current: activeTrack, isPlaying: playerPlaying } = state

  const play = useCallback(
    async (kind: CollectionKind | 'artist', id: string, label = '') => {
      const contextId = collectionContextId(kind, id)
      if (activeContext === contextId && activeTrack) {
        actions.togglePlay()
        return
      }
      if (kind === 'liked') {
        try {
          const collection = await catalogService.getLikedPlayable()
          if (collection.tracks.length === 0) actions.notify('You have no saved songs to play yet.')
          else actions.playTracks(collection.tracks, { label: label || collection.label, contextId })
        } catch {
          actions.notify('Could not load your saved songs. Try again.')
        }
        return
      }
      actions.playTracks([], { label, contextId, contextUri: `spotify:${kind}:${id}` })
    },
    [activeContext, activeTrack, actions],
  )

  const isPlaying = useCallback((kind: CollectionKind | 'artist', id: string) => playerPlaying && activeContext === collectionContextId(kind, id), [playerPlaying, activeContext])

  return { play, isPlaying }
}
