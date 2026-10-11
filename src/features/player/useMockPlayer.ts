import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { Track } from '../catalog'
import { createInitialState, playerReducer } from './reducer'
import type { PlaybackStatus, PlayerActions, PlayerApi } from './types'

const TICK_MS = 250
const NOTICE_MS = 2400

export const SIMULATED_STATUS: PlaybackStatus = {
  availability: 'simulated',
  label: 'Simulated playback',
  detail: 'No audio is produced and nothing is sent to Spotify.',
  deviceName: null,
  isActiveDevice: false,
  busy: false,
  action: null,
}

/**
 * MOCK ENGINE. Simulates a player clock and queue; it produces no audio and never talks to Spotify.
 * It runs only while there is no usable Spotify session (signed out, or not yet reconnected with the
 * playback permission). With a session, `useSpotifyPlayer` takes over. The invented sample tracks
 * cannot be played for real, so this engine is what keeps the preview UI usable.
 */
export function useMockPlayer(initialTracks: Track[]): PlayerApi {
  const [state, dispatch] = useReducer(playerReducer, initialTracks, createInitialState)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number | undefined>(undefined)

  // Player clock: advance position by real elapsed time while playing.
  useEffect(() => {
    if (!state.isPlaying) return
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      dispatch({ type: 'tick', deltaMs: now - last })
      last = now
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [state.isPlaying])

  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  const actions = useMemo<PlayerActions>(() => {
    const notify = (message: string) => {
      window.clearTimeout(noticeTimer.current)
      setNotice(message)
      noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS)
    }
    const needsSpotify = () => notify('Connect Spotify to play real music.')
    return {
      playTracks: (tracks, options) => dispatch({ type: 'play-tracks', tracks, label: options.label, contextId: options.contextId, ...(options.startIndex === undefined ? {} : { startIndex: options.startIndex }) }),
      togglePlay: () => dispatch({ type: 'toggle' }),
      next: () => dispatch({ type: 'next' }),
      previous: () => dispatch({ type: 'previous' }),
      seek: (positionMs) => dispatch({ type: 'seek', positionMs }),
      setVolume: (volume) => dispatch({ type: 'set-volume', volume }),
      toggleMute: () => dispatch({ type: 'toggle-mute' }),
      toggleShuffle: () => dispatch({ type: 'toggle-shuffle' }),
      cycleRepeat: () => dispatch({ type: 'cycle-repeat' }),
      addToQueue: (track) => {
        dispatch({ type: 'enqueue', track })
        notify(`Added "${track.title}" to queue`)
      },
      removeFromQueue: (index) => dispatch({ type: 'dequeue', index }),
      clearQueue: () => dispatch({ type: 'clear-queue' }),
      playQueued: (list, index) => dispatch({ type: 'play-queued', list, index }),
      playSpotifyLink: needsSpotify,
      playHere: needsSpotify,
      retryPlayer: needsSpotify,
      notify,
    }
  }, [])

  return useMemo<PlayerApi>(() => ({ engine: 'mock', state, actions, status: SIMULATED_STATUS, notice }), [state, actions, notice])
}
