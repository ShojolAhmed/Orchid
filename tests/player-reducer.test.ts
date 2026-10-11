import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createInitialState, playerReducer } from '../src/features/player/reducer.ts'
import type { PlayerState } from '../src/features/player/types.ts'

const make = (id: string, seconds = 100) => ({
  id,
  title: id,
  artistId: 'a',
  artistName: 'A',
  albumId: 'al',
  albumTitle: 'Al',
  trackNumber: 1,
  durationMs: seconds * 1000,
  artwork: { seed: 1 },
})
const tracks = ['t1', 't2', 't3', 't4'].map((id) => make(id))
const ids = (list: Array<{ id: string }>) => list.map((t) => t.id)
const play = (state: PlayerState, startIndex?: number, contextId = 'ctx') => playerReducer(state, { type: 'play-tracks', tracks, startIndex, label: 'L', contextId })

describe('player reducer', () => {
  it('starts paused on the first sample track', () => {
    const s = createInitialState(tracks)
    assert.equal(s.current?.id, 't1')
    assert.equal(s.isPlaying, false)
    assert.deepEqual(ids(s.upNext), ['t2', 't3', 't4'])
  })

  it('plays a collection from a row and queues the rest in order', () => {
    const s = play(createInitialState([]), 1)
    assert.equal(s.current?.id, 't2')
    assert.equal(s.isPlaying, true)
    assert.deepEqual(ids(s.upNext), ['t3', 't4'])
  })

  it('toggles instead of restarting when the same context and track is played again', () => {
    const playing = play(createInitialState([]), 0)
    const paused = play(playing, 0)
    assert.equal(paused.isPlaying, false)
    assert.equal(paused.positionMs, playing.positionMs)
    assert.equal(play(paused, 0).isPlaying, true)
  })

  it('collection play (no index) toggles when that context is active', () => {
    const playing = play(createInitialState([]), 2)
    assert.equal(play(playing, undefined).isPlaying, false)
    assert.equal(play(playing, undefined).current?.id, 't3')
  })

  it('user queue plays before the rest of the context', () => {
    let s = play(createInitialState([]), 0)
    s = playerReducer(s, { type: 'enqueue', track: make('q1') })
    s = playerReducer(s, { type: 'next' })
    assert.equal(s.current?.id, 'q1')
    s = playerReducer(s, { type: 'next' })
    assert.equal(s.current?.id, 't2')
  })

  it('previous restarts after 3 s, otherwise goes back and restores upNext', () => {
    let s = playerReducer(play(createInitialState([]), 0), { type: 'next' })
    s = playerReducer(s, { type: 'tick', deltaMs: 5000 })
    s = playerReducer(s, { type: 'previous' })
    assert.equal(s.current?.id, 't2')
    assert.equal(s.positionMs, 0)
    s = playerReducer(s, { type: 'previous' })
    assert.equal(s.current?.id, 't1')
    assert.deepEqual(ids(s.upNext), ['t2', 't3', 't4'])
  })

  it('stops at the end with repeat off, wraps with repeat all, loops with repeat one', () => {
    const last = play(createInitialState([]), 3)
    const ended = playerReducer({ ...last, positionMs: 99_000 }, { type: 'tick', deltaMs: 2000 })
    assert.equal(ended.isPlaying, false)
    assert.equal(ended.current?.id, 't4')

    const all = playerReducer({ ...last, repeat: 'all', positionMs: 99_000 }, { type: 'tick', deltaMs: 2000 })
    assert.equal(all.current?.id, 't1')
    assert.equal(all.isPlaying, true)

    const one = playerReducer({ ...last, repeat: 'one', positionMs: 99_000 }, { type: 'tick', deltaMs: 2000 })
    assert.equal(one.current?.id, 't4')
    assert.equal(one.positionMs, 0)
  })

  it('shuffle keeps every track exactly once and unshuffle restores order', () => {
    let s = play(createInitialState([]), 0)
    s = playerReducer(s, { type: 'toggle-shuffle' })
    assert.deepEqual(ids(s.upNext).sort(), ['t2', 't3', 't4'])
    s = playerReducer(s, { type: 'toggle-shuffle' })
    assert.deepEqual(ids(s.upNext), ['t2', 't3', 't4'])
  })

  it('clamps seek and volume, and only ticks while playing', () => {
    const s = play(createInitialState([]), 0)
    assert.equal(playerReducer(s, { type: 'seek', positionMs: 1e9 }).positionMs, 100_000)
    assert.equal(playerReducer(s, { type: 'seek', positionMs: -5 }).positionMs, 0)
    assert.equal(playerReducer(s, { type: 'set-volume', volume: 4 }).volume, 1)
    const paused = playerReducer(s, { type: 'toggle' })
    assert.equal(playerReducer(paused, { type: 'tick', deltaMs: 1000 }), paused)
  })

  it('play-queued jumps and drops what it skipped', () => {
    let s = play(createInitialState([]), 0)
    s = playerReducer(s, { type: 'play-queued', list: 'next', index: 1 })
    assert.equal(s.current?.id, 't3')
    assert.deepEqual(ids(s.upNext), ['t4'])
    assert.deepEqual(ids(s.history), ['t1', 't2'])
  })
})
