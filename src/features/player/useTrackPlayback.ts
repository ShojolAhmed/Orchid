import type { Track } from '../catalog'
import { usePlayer } from './PlayerContext'

/** Wires a TrackList to the player: play/pause a row, add a row to the queue. */
export function useTrackPlayback(tracks: Track[], label: string, contextId: string, contextUri?: string) {
  const { state, actions } = usePlayer()
  return {
    currentId: state.current?.id ?? null,
    isPlaying: state.isPlaying,
    play: (index: number) => actions.playTracks(tracks, { startIndex: index, label, contextId, ...(contextUri ? { contextUri } : {}) }),
    addToQueue: (index: number) => {
      const track = tracks[index]
      if (track) actions.addToQueue(track)
    },
  }
}
