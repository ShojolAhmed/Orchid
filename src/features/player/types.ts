import type { Track } from '../catalog'

export type RepeatMode = 'off' | 'all' | 'one'

export interface PlayerState {
  current: Track | null
  isPlaying: boolean
  positionMs: number
  /** 0 to 1. */
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  /** Identifies what is playing, e.g. "album:neon-tides". Lets cards show a pause icon. */
  contextId: string | null
  contextLabel: string | null
  contextTracks: Track[]
  /** Remaining tracks from the context, in play order (already shuffled if shuffle is on). */
  upNext: Track[]
  /** Tracks the user added; these play before the rest of the context. */
  userQueue: Track[]
  history: Track[]
  /** Seed for the deterministic shuffle so the reducer stays pure. */
  rng: number
}

export interface PlayOptions {
  /** Omit to play the collection from its start (or a random track when shuffle is on). */
  startIndex?: number
  label: string
  contextId: string
  /** Spotify context URI (`spotify:album:<id>` and so on) when the collection is a real Spotify one. */
  contextUri?: string
}

/**
 * Everything the UI may do to playback. Both engines implement it: the mock engine
 * (simulated, no audio) and the Spotify Web Playback SDK engine (real audio).
 */
export interface PlayerActions {
  playTracks(tracks: Track[], options: PlayOptions): void
  togglePlay(): void
  next(): void
  previous(): void
  seek(positionMs: number): void
  setVolume(volume: number): void
  toggleMute(): void
  toggleShuffle(): void
  cycleRepeat(): void
  addToQueue(track: Track): void
  removeFromQueue(index: number): void
  clearQueue(): void
  playQueued(list: 'queue' | 'next', index: number): void
  /** Plays a pasted Spotify link or URI (track, album, playlist or artist). Real playback only. */
  playSpotifyLink(input: string): void
  /** Makes this browser the active Spotify device (Spotify Connect transfer). */
  playHere(): void
  /** Tears the Spotify player down and connects it again. */
  retryPlayer(): void
  /** Shows a short polite toast. */
  notify(message: string): void
}

/**
 * Where real playback stands. `simulated` means the mock engine is running; every other value
 * describes the Spotify engine or why it is not running.
 */
export type PlaybackAvailability = 'simulated' | 'sign-in-required' | 'reconnect-required' | 'loading' | 'connecting' | 'ready' | 'reconnecting' | 'error'

export type PlaybackAction = 'sign-in' | 'reconnect-spotify' | 'retry-player' | 'play-here'

export interface PlaybackStatus {
  availability: PlaybackAvailability
  /** One short line for the player bar and Setup status. */
  label: string
  /** An accurate, actionable explanation when something is wrong; otherwise null. */
  detail: string | null
  deviceName: string | null
  /** Spotify reports playback running on this browser. */
  isActiveDevice: boolean
  /** A start-playback or transfer request is in flight. */
  busy: boolean
  action: PlaybackAction | null
}

export interface PlayerApi {
  /** "mock" means no audio is produced. A real engine reports "spotify". */
  engine: 'mock' | 'spotify'
  state: PlayerState
  actions: PlayerActions
  status: PlaybackStatus
  notice: string | null
}
