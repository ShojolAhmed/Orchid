import { useCallback, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { NowPlayingSheet, PlayerBar, QueuePanel, type PlayerTrackInfo, type PlayerViewHandlers, type PlayerViewState, type QueueItemView } from '../../components/layout'
import { paths } from '../../lib/paths'
import { useAuth } from '../auth'
import type { Track } from '../catalog'
import { toDeviceView } from './deviceView'
import { usePlayer } from './PlayerContext'

function toTrackInfo(track: Track): PlayerTrackInfo {
  return {
    id: track.id,
    title: track.title,
    artistName: track.artistName,
    artistHref: paths.artist(track.artistId),
    albumHref: paths.album(track.albumId),
    durationMs: track.durationMs,
    artwork: track.artwork,
  }
}

function toQueueItem(track: Track): QueueItemView {
  return { id: track.id, title: track.title, artistName: track.artistName, durationMs: track.durationMs, artwork: track.artwork }
}

interface QueueToggleProps {
  queueOpen: boolean
  onToggleQueue: () => void
}

/** Binds the presentational player bar (and the mobile now-playing sheet) to the active player engine. */
export function ConnectedPlayerBar({ queueOpen, onToggleQueue }: QueueToggleProps) {
  const { state, actions, engine, status } = usePlayer()
  const { actions: auth } = useAuth()
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}${location.hash}`
  const [sheetOpen, setSheetOpen] = useState(false)

  const { current: track, isPlaying, positionMs, volume, muted, shuffle, repeat, contextLabel } = state
  const view = useMemo<PlayerViewState>(
    () => ({
      track: track ? toTrackInfo(track) : null,
      isPlaying,
      positionMs,
      volume,
      muted,
      shuffle,
      repeat,
      queueOpen,
      contextLabel,
      engineNote: engine === 'mock' ? 'Simulated playback, no audio' : 'Spotify Web Playback',
      busy: status.busy,
      // While nothing is loaded, say what the player is doing or why it cannot play.
      statusText: track || status.availability === 'simulated' || status.availability === 'ready' ? null : status.label,
      device: toDeviceView(status),
    }),
    [track, isPlaying, positionMs, volume, muted, shuffle, repeat, queueOpen, contextLabel, engine, status],
  )

  const statusAction = status.action
  const onDeviceAction = useCallback(() => {
    if (statusAction === 'sign-in' || statusAction === 'reconnect-spotify') void auth.login(returnTo)
    else if (statusAction === 'retry-player') actions.retryPlayer()
    else if (statusAction === 'play-here') actions.playHere()
  }, [statusAction, auth, returnTo, actions])

  const handlers = useMemo<PlayerViewHandlers>(
    () => ({
      onTogglePlay: actions.togglePlay,
      onPrevious: actions.previous,
      onNext: actions.next,
      onSeek: actions.seek,
      onVolume: actions.setVolume,
      onToggleMute: actions.toggleMute,
      onToggleShuffle: actions.toggleShuffle,
      onCycleRepeat: actions.cycleRepeat,
      onToggleQueue,
      onDeviceAction,
    }),
    [actions, onToggleQueue, onDeviceAction],
  )

  const closeSheet = useCallback(() => setSheetOpen(false), [])

  return (
    <>
      <PlayerBar state={view} handlers={handlers} onOpenNowPlaying={() => setSheetOpen(true)} />
      <NowPlayingSheet open={sheetOpen} state={view} handlers={handlers} onClose={closeSheet} />
    </>
  )
}

export function ConnectedQueuePanel({ queueOpen, onToggleQueue }: QueueToggleProps) {
  const { state, actions } = usePlayer()
  return (
    <QueuePanel
      open={queueOpen}
      nowPlaying={state.current ? toQueueItem(state.current) : null}
      queued={state.userQueue.map(toQueueItem)}
      upNext={state.upNext.map(toQueueItem)}
      contextLabel={state.contextLabel}
      onClose={onToggleQueue}
      onClear={actions.clearQueue}
      onRemoveQueued={actions.removeFromQueue}
      onPlayQueued={actions.playQueued}
    />
  )
}
