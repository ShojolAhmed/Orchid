import { useEffect, useMemo, type ReactNode } from 'react'
import { spotifyConfig } from '../../config/spotify'
import { useAuth, FEATURE_SCOPES } from '../auth'
import { findMissingScopes } from '../auth/scopes'
import type { Track } from '../catalog'
import { getEligibility, simulatedStatus } from './eligibility'
import { PlayerContext } from './PlayerContext'
import type { PlayerApi } from './types'
import { useMockPlayer } from './useMockPlayer'
import { useSpotifyPlayer } from './useSpotifyPlayer'

interface PlayerProviderProps {
  /** Tracks loaded (paused) in the simulated engine on first render. */
  initialTracks: Track[]
  children: ReactNode
}

/**
 * Picks the player engine without remounting anything: both engines live in this one provider, so the
 * layout, queue panel state and page scroll survive a sign-in or sign-out. The Spotify engine runs only
 * with a signed-in session that holds the playback permission; otherwise the silent simulated engine
 * keeps the preview usable and the UI says plainly that it is simulated.
 */
export function PlayerProvider({ initialTracks, children }: PlayerProviderProps) {
  const { state: auth } = useAuth()
  // Only the playback scopes decide whether the real player runs. A session from before the library
  // permissions existed keeps playing; library pages ask it to reconnect on their own.
  const missingPlayback = findMissingScopes(FEATURE_SCOPES.playback, auth.grantedScopes)
  const eligibility = getEligibility(auth.status, missingPlayback, Boolean(spotifyConfig.clientId))
  const eligible = eligibility === 'eligible'

  const mock = useMockPlayer(initialTracks)
  const spotify = useSpotifyPlayer(eligible)

  // Never leave a simulated clock running behind the real player.
  const { isPlaying: mockPlaying } = mock.state
  const { togglePlay: toggleMock } = mock.actions
  useEffect(() => {
    if (eligible && mockPlaying) toggleMock()
  }, [eligible, mockPlaying, toggleMock])

  const value = useMemo<PlayerApi>(() => {
    if (eligibility === 'eligible') return spotify
    return { ...mock, status: simulatedStatus(eligibility, mock.status) }
  }, [eligibility, spotify, mock])

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}
