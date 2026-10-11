import type { ArtworkSource } from '../ui'

export type RepeatMode = 'off' | 'all' | 'one'

/** What the player bar needs to know about a track, with links already resolved. */
export interface PlayerTrackInfo {
  id: string
  title: string
  artistName: string
  artistHref: string
  albumHref: string
  durationMs: number
  artwork: ArtworkSource
}

export type DeviceTone = 'ok' | 'info' | 'busy' | 'warn'

/** What the devices menu shows about this browser's player. */
export interface DeviceView {
  name: string
  /** Short status line, e.g. "Orchid Web Player is ready". */
  label: string
  /** Longer, actionable explanation when there is one. */
  detail: string | null
  tone: DeviceTone
  /** Label of the one button the menu may offer (connect, reconnect, retry, play here). */
  actionLabel: string | null
}

export interface PlayerViewState {
  track: PlayerTrackInfo | null
  isPlaying: boolean
  positionMs: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  queueOpen: boolean
  /** Honest description of the engine, shown in the devices popover. */
  engineNote: string
  contextLabel: string | null
  /** A request to start or transfer playback is in flight; the play button waits. */
  busy: boolean
  /** Shown in place of "Pick something to start" while there is no track (connecting, unavailable, ...). */
  statusText: string | null
  device: DeviceView
}

export interface PlayerViewHandlers {
  onTogglePlay: () => void
  onPrevious: () => void
  onNext: () => void
  onSeek: (positionMs: number) => void
  onVolume: (volume: number) => void
  onToggleMute: () => void
  onToggleShuffle: () => void
  onCycleRepeat: () => void
  onToggleQueue: () => void
  /** The devices menu's single action (connect, reconnect, retry player, play on this browser). */
  onDeviceAction: () => void
}
