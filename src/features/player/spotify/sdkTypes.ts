/**
 * Minimal typings for the Spotify Web Playback SDK, written from the official reference
 * (https://developer.spotify.com/documentation/web-playback-sdk/reference). Only what Orchid uses is
 * declared, so there is no dependency on the community `@types` package.
 *
 * Nothing here touches the DOM or `window`, so Node tests can import it.
 */

export interface SdkImage {
  url: string
  width?: number
  height?: number
}

export interface SdkTrack {
  uri: string
  /** Can be null (for example for local files). */
  id: string | null
  type: 'track' | 'episode' | 'ad'
  media_type?: 'audio' | 'video'
  name: string
  is_playable?: boolean
  album: { uri: string; name: string; images: SdkImage[] }
  artists: Array<{ uri: string; name: string }>
}

export type SdkDisallowKey = 'pausing' | 'peeking_next' | 'peeking_prev' | 'resuming' | 'seeking' | 'skipping_next' | 'skipping_prev'

export interface SdkState {
  context: { uri: string | null; metadata: Record<string, unknown> | null }
  /** `true` means "not permitted"; `false` or absent means allowed. */
  disallows: Partial<Record<SdkDisallowKey, boolean>>
  paused: boolean
  /** Milliseconds into the current track. */
  position: number
  duration: number
  /** 0 = off, 1 = repeat context, 2 = repeat track. */
  repeat_mode: 0 | 1 | 2
  shuffle: boolean
  track_window: {
    current_track: SdkTrack
    previous_tracks: SdkTrack[]
    next_tracks: SdkTrack[]
  }
}

export interface SdkErrorPayload {
  message: string
}

export interface SdkEventMap {
  ready: { device_id: string }
  not_ready: { device_id: string }
  /** Documented as "emitted when the state of the local playback has changed". `null` means nothing is playing on this device. */
  player_state_changed: SdkState | null
  autoplay_failed: null | undefined
  initialization_error: SdkErrorPayload
  authentication_error: SdkErrorPayload
  account_error: SdkErrorPayload
  playback_error: SdkErrorPayload
}

export type SdkEventName = keyof SdkEventMap

export interface SdkPlayer {
  connect(): Promise<boolean>
  disconnect(): void
  addListener<E extends SdkEventName>(event: E, callback: (payload: SdkEventMap[E]) => void): boolean
  removeListener<E extends SdkEventName>(event: E, callback?: (payload: SdkEventMap[E]) => void): boolean
  getCurrentState(): Promise<SdkState | null>
  setVolume(volume: number): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  togglePlay(): Promise<void>
  seek(positionMs: number): Promise<void>
  previousTrack(): Promise<void>
  nextTrack(): Promise<void>
  activateElement(): Promise<void>
}

export interface SdkPlayerOptions {
  name: string
  /** Called on every `connect()` and when the token expires. Must call `callback` with a valid access token. */
  getOAuthToken: (callback: (token: string) => void) => void
  volume?: number
  enableMediaSession?: boolean
}

export interface SdkNamespace {
  Player: new (options: SdkPlayerOptions) => SdkPlayer
}

/** The globals the SDK script uses. */
export interface SdkHost {
  Spotify?: SdkNamespace
  onSpotifyWebPlaybackSDKReady?: (() => void) | undefined
}
