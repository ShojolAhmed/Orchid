import type { Track } from '../catalog'
import type { PlayerState, RepeatMode } from './types'

export type PlayerAction =
  | { type: 'play-tracks'; tracks: Track[]; startIndex?: number; label: string; contextId: string }
  | { type: 'toggle' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'tick'; deltaMs: number }
  | { type: 'seek'; positionMs: number }
  | { type: 'set-volume'; volume: number }
  | { type: 'toggle-mute' }
  | { type: 'toggle-shuffle' }
  | { type: 'cycle-repeat' }
  | { type: 'enqueue'; track: Track }
  | { type: 'dequeue'; index: number }
  | { type: 'clear-queue' }
  | { type: 'play-queued'; list: 'queue' | 'next'; index: number }

const RESTART_THRESHOLD_MS = 3000

export function createInitialState(tracks: Track[]): PlayerState {
  const [first, ...rest] = tracks
  return {
    current: first ?? null,
    isPlaying: false,
    positionMs: 0,
    volume: 0.7,
    muted: false,
    shuffle: false,
    repeat: 'off',
    contextId: first ? 'sample' : null,
    contextLabel: first ? 'Sample queue' : null,
    contextTracks: tracks,
    upNext: rest,
    userQueue: [],
    history: [],
    rng: Math.floor(Math.random() * 2 ** 32),
  }
}

/** mulberry32: tiny seeded PRNG. Returns [value in 0..1, next seed]. */
function random(seed: number): [number, number] {
  const next = (seed + 0x6d2b79f5) >>> 0
  let r = Math.imul(next ^ (next >>> 15), 1 | next)
  r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, next]
}

function shuffled<T>(items: T[], seed: number): [T[], number] {
  const out = [...items]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    const [value, next] = random(s)
    s = next
    const j = Math.floor(value * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return [out, s]
}

function startContext(state: PlayerState, tracks: Track[], startIndex: number | undefined, label: string, contextId: string): PlayerState {
  if (tracks.length === 0) return state
  let rng = state.rng
  let index = startIndex ?? 0
  if (startIndex === undefined && state.shuffle) {
    const [value, next] = random(rng)
    rng = next
    index = Math.floor(value * tracks.length)
  }
  const current = tracks[index]
  let upNext: Track[]
  if (state.shuffle) {
    const [mixed, next] = shuffled(
      tracks.filter((_, i) => i !== index),
      rng,
    )
    upNext = mixed
    rng = next
  } else {
    upNext = tracks.slice(index + 1)
  }
  return { ...state, current, isPlaying: true, positionMs: 0, contextId, contextLabel: label, contextTracks: tracks, upNext, history: [], rng }
}

/** Moves to the next track: user queue first, then the context, then repeat-all or stop. */
function advance(state: PlayerState): PlayerState {
  const { current } = state
  if (!current) return state
  const history = [...state.history, current]
  const queued = state.userQueue[0]
  if (queued) return { ...state, current: queued, userQueue: state.userQueue.slice(1), history, positionMs: 0, isPlaying: true }
  const upcoming = state.upNext[0]
  if (upcoming) return { ...state, current: upcoming, upNext: state.upNext.slice(1), history, positionMs: 0, isPlaying: true }
  if (state.repeat === 'all' && state.contextTracks.length > 0 && state.contextId && state.contextLabel) {
    const restarted = startContext({ ...state, history: [] }, state.contextTracks, state.shuffle ? undefined : 0, state.contextLabel, state.contextId)
    return restarted
  }
  return { ...state, isPlaying: false, positionMs: 0 }
}

const repeatOrder: RepeatMode[] = ['off', 'all', 'one']

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'play-tracks': {
      const target = action.tracks[action.startIndex ?? 0]
      const sameContext = action.contextId === state.contextId
      const sameTrack = action.startIndex === undefined ? true : target?.id === state.current?.id
      if (sameContext && sameTrack && state.current) return { ...state, isPlaying: !state.isPlaying }
      return startContext(state, action.tracks, action.startIndex, action.label, action.contextId)
    }
    case 'toggle':
      return state.current ? { ...state, isPlaying: !state.isPlaying } : state
    case 'next':
      return advance(state)
    case 'previous': {
      const previous = state.history[state.history.length - 1]
      if (!state.current) return state
      if (state.positionMs > RESTART_THRESHOLD_MS || !previous) return { ...state, positionMs: 0 }
      return { ...state, current: previous, history: state.history.slice(0, -1), upNext: [state.current, ...state.upNext], positionMs: 0, isPlaying: true }
    }
    case 'tick': {
      if (!state.isPlaying || !state.current) return state
      const position = state.positionMs + action.deltaMs
      if (position < state.current.durationMs) return { ...state, positionMs: position }
      return state.repeat === 'one' ? { ...state, positionMs: 0 } : advance(state)
    }
    case 'seek':
      return state.current ? { ...state, positionMs: Math.min(Math.max(0, action.positionMs), state.current.durationMs) } : state
    case 'set-volume': {
      const volume = Math.min(1, Math.max(0, action.volume))
      return { ...state, volume, muted: volume === 0 }
    }
    case 'toggle-mute':
      return { ...state, muted: !state.muted }
    case 'toggle-shuffle': {
      if (!state.shuffle) {
        const [upNext, rng] = shuffled(state.upNext, state.rng)
        return { ...state, shuffle: true, upNext, rng }
      }
      const at = state.current ? state.contextTracks.findIndex((t) => t.id === state.current?.id) : -1
      return { ...state, shuffle: false, upNext: at >= 0 ? state.contextTracks.slice(at + 1) : state.upNext }
    }
    case 'cycle-repeat':
      return { ...state, repeat: repeatOrder[(repeatOrder.indexOf(state.repeat) + 1) % repeatOrder.length] }
    case 'enqueue':
      return { ...state, userQueue: [...state.userQueue, action.track] }
    case 'dequeue':
      return { ...state, userQueue: state.userQueue.filter((_, i) => i !== action.index) }
    case 'clear-queue':
      return { ...state, userQueue: [] }
    case 'play-queued': {
      if (!state.current) return state
      if (action.list === 'queue') {
        const track = state.userQueue[action.index]
        if (!track) return state
        return { ...state, current: track, userQueue: state.userQueue.slice(action.index + 1), history: [...state.history, state.current], positionMs: 0, isPlaying: true }
      }
      const track = state.upNext[action.index]
      if (!track) return state
      return {
        ...state,
        current: track,
        upNext: state.upNext.slice(action.index + 1),
        history: [...state.history, state.current, ...state.upNext.slice(0, action.index)],
        positionMs: 0,
        isPlaying: true,
      }
    }
  }
}
