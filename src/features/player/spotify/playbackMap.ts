import type { Track } from '../../catalog/types.ts'
import type { PlayerState, RepeatMode } from '../types.ts'
import { idFromUri } from './uris.ts'
import type { SdkDisallowKey, SdkImage, SdkState, SdkTrack } from './sdkTypes.ts'

/** What the engine keeps about the current Spotify playback. Immutable; replaced on every change. */
export interface PlaybackView {
  track: SdkTrack
  isPlaying: boolean
  positionMs: number
  durationMs: number
  shuffle: boolean
  repeat: RepeatMode
  disallows: Readonly<Partial<Record<SdkDisallowKey, boolean>>>
  contextUri: string | null
  contextDescription: string | null
  next: SdkTrack[]
  previous: SdkTrack[]
}

export function repeatFromSdk(mode: 0 | 1 | 2): RepeatMode {
  return mode === 1 ? 'all' : mode === 2 ? 'one' : 'off'
}

export function toPlaybackView(state: SdkState): PlaybackView {
  const description = state.context.metadata?.context_description
  return {
    track: state.track_window.current_track,
    isPlaying: !state.paused,
    positionMs: Math.max(0, Math.round(state.position)),
    durationMs: Math.max(0, Math.round(state.duration)),
    shuffle: state.shuffle,
    repeat: repeatFromSdk(state.repeat_mode),
    disallows: { ...state.disallows },
    contextUri: state.context.uri ?? null,
    contextDescription: typeof description === 'string' && description ? description : null,
    next: state.track_window.next_tracks,
    previous: state.track_window.previous_tracks,
  }
}

/**
 * Two views are "the same" for rendering when only the position moved a little. This keeps the
 * once-a-second progress poll from re-rendering the app when nothing visible changed (a paused track).
 */
export function sameView(a: PlaybackView, b: PlaybackView, positionToleranceMs = 400): boolean {
  return (
    a.track.uri === b.track.uri &&
    a.isPlaying === b.isPlaying &&
    a.durationMs === b.durationMs &&
    a.shuffle === b.shuffle &&
    a.repeat === b.repeat &&
    a.contextUri === b.contextUri &&
    a.contextDescription === b.contextDescription &&
    Math.abs(a.positionMs - b.positionMs) < positionToleranceMs &&
    JSON.stringify(a.disallows) === JSON.stringify(b.disallows) &&
    a.next.map((t) => t.uri).join('|') === b.next.map((t) => t.uri).join('|') &&
    a.previous.map((t) => t.uri).join('|') === b.previous.map((t) => t.uri).join('|')
  )
}

function pickImage(images: SdkImage[]): string | undefined {
  const usable = images.filter((image) => image.url)
  const sized = usable.find((image) => (image.width ?? 0) >= 160 && (image.width ?? 0) <= 700)
  return (sized ?? usable[0])?.url
}

/** Stable placeholder hue so a track without art keeps the same gradient. */
function seedFor(uri: string): number {
  let hash = 0
  for (const char of uri) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return hash
}

/** Maps an SDK track to the app's `Track`. The SDK only reports a duration for the current track, so others get 0. */
export function toTrack(track: SdkTrack, durationMs = 0): Track {
  const imageUrl = pickImage(track.album.images)
  return {
    id: track.id ?? track.uri,
    uri: track.uri,
    title: track.name,
    artistId: idFromUri(track.artists[0]?.uri),
    artistName: track.artists.map((artist) => artist.name).join(', ') || 'Unknown artist',
    albumId: idFromUri(track.album.uri),
    albumTitle: track.album.name,
    trackNumber: 0,
    durationMs,
    artwork: { seed: seedFor(track.uri), ...(imageUrl ? { imageUrl } : {}) },
  }
}

/** `spotify:album:<id>` becomes `album:<id>`, the same shape the cards use to recognise the active context. */
export function contextIdFromUri(uri: string | null): string | null {
  if (!uri) return null
  const parts = uri.split(':')
  if (parts[1] === 'user' && parts[3] === 'collection') return 'liked'
  if ((parts[1] === 'album' || parts[1] === 'playlist' || parts[1] === 'artist') && parts[2]) return `${parts[1]}:${parts[2]}`
  return uri
}

export interface StartedContext {
  contextUri: string | null
  contextId: string | null
  label: string
}

/** Builds the player state the UI reads from what the SDK reported. Nothing here is simulated. */
export function toPlayerState(view: PlaybackView | null, volume: number, muted: boolean, started: StartedContext | null): PlayerState {
  const base = { volume, muted, userQueue: [] as Track[], contextTracks: [] as Track[], rng: 0 }
  if (!view) {
    return { ...base, current: null, isPlaying: false, positionMs: 0, shuffle: false, repeat: 'off', contextId: null, contextLabel: null, upNext: [], history: [] }
  }
  const matchesStarted = started !== null && started.contextUri === view.contextUri
  return {
    ...base,
    current: toTrack(view.track, view.durationMs),
    isPlaying: view.isPlaying,
    positionMs: view.positionMs,
    shuffle: view.shuffle,
    repeat: view.repeat,
    contextId: matchesStarted && started.contextId ? started.contextId : contextIdFromUri(view.contextUri),
    contextLabel: matchesStarted ? started.label : view.contextDescription,
    upNext: view.next.map((track) => toTrack(track)),
    history: view.previous.map((track) => toTrack(track)),
  }
}
