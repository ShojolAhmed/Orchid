import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AuthRequiredError } from '../src/features/auth/errors.ts'
import { COMMAND_GUARD_MS, PROGRESS_POLL_MS, SEEK_DEBOUNCE_MS } from '../src/features/player/spotify/engine.ts'
import { buildStartRequest } from '../src/features/player/spotify/startRequest.ts'
import { PlaybackApiError } from '../src/features/player/spotify/webApi.ts'
import { playbackIssues } from '../src/features/player/spotify/playbackIssues.ts'
import { connectOutcome, flush, makeEngine, state, TRACK } from './helpers/spotify-harness.ts'

const req = (n = 1) => {
  const r = buildStartRequest([{ id: 'a', uri: TRACK(n), title: 't', artistId: '', artistName: '', albumId: '', albumTitle: '', trackNumber: 1, durationMs: 1, artwork: { seed: 1 } }], { label: 'L', contextId: 'c' })
  if (!r.ok) throw new Error('bad request')
  return r.request
}

describe('initialization and connection', () => {
  it('loads the SDK once, creates one player, registers each listener once and uses the auth token', async () => {
    const h = makeEngine()
    h.engine.connect()
    h.engine.connect()
    await flush()
    assert.equal(h.loads(), 1)
    assert.equal(h.players.length, 1)
    assert.equal(h.engine.getSnapshot().phase, 'connecting')
    assert.equal(h.player().options.name, 'Test Player')
    assert.equal(h.player().options.volume, 0.7)
    assert.equal(h.player().listenerCount(), 8)
    await flush()
    assert.equal(h.tokens.calls, 1)
    assert.ok(h.player().calls.includes('token-cb'))
  })
  it('becomes ready with a device id, and recovers from not_ready', async () => {
    const h = makeEngine()
    await h.ready('abc')
    assert.deepEqual([h.engine.getSnapshot().phase, h.engine.getSnapshot().deviceId, h.engine.getSnapshot().isActiveDevice], ['ready', 'abc', false])
    h.player().emit('not_ready', { device_id: 'abc' })
    assert.equal(h.engine.getSnapshot().phase, 'reconnecting')
    assert.equal(h.engine.getSnapshot().issue?.code, 'offline')
    h.player().emit('ready', { device_id: 'abc' })
    assert.equal(h.engine.getSnapshot().phase, 'ready')
    assert.equal(h.engine.getSnapshot().issue, null)
  })
  it('reports connect() resolving false as connect-failed, and does not override a specific SDK error', async () => {
    connectOutcome.value = false
    try {
      const h = makeEngine()
      h.engine.connect()
      await flush()
      await flush()
      assert.deepEqual([h.engine.getSnapshot().phase, h.engine.getSnapshot().issue?.code], ['error', 'connect-failed'])
    } finally {
      connectOutcome.value = true
    }
  })
  it('SDK load failure is an actionable error', async () => {
    const h = makeEngine({ loadSdk: () => Promise.reject(new Error('blocked')) })
    h.engine.connect()
    await flush()
    const s = h.engine.getSnapshot()
    assert.deepEqual([s.phase, s.issue?.code, s.issue?.action], ['error', 'sdk-load-failed', 'retry-player'])
  })
  it('initialization_error, account_error and authentication_error', async () => {
    let h = makeEngine()
    await h.ready()
    h.player().emit('initialization_error', { message: 'EME' })
    assert.equal(h.engine.getSnapshot().issue?.code, 'unsupported-browser')
    assert.ok(h.players[0]?.calls.includes('disconnect'))

    h = makeEngine()
    await h.ready()
    h.player().emit('account_error', { message: 'premium' })
    assert.equal(h.engine.getSnapshot().issue?.code, 'premium-required')
    assert.equal(h.engine.getSnapshot().phase, 'error')

    // First authentication error: drop the token and reconnect once with a new player.
    h = makeEngine()
    await h.ready()
    h.player().emit('authentication_error', { message: 'bad' })
    await flush()
    assert.equal(h.tokens.invalidated, 1)
    assert.equal(h.players.length, 2)
    assert.equal(h.engine.getSnapshot().phase, 'connecting')
    // A second one inside the window is shown to the person, not retried forever.
    h.player().emit('authentication_error', { message: 'bad' })
    assert.equal(h.players.length, 2)
    assert.deepEqual([h.engine.getSnapshot().phase, h.engine.getSnapshot().issue?.code, h.engine.getSnapshot().issue?.action], ['error', 'authentication', 'reconnect-spotify'])
  })
  it('does not call the SDK back with a token when the session is gone', async () => {
    const h = makeEngine()
    h.tokens.fail = new AuthRequiredError({ code: 'session-expired', message: 'x', retryable: false })
    h.engine.connect()
    await flush()
    await flush()
    assert.equal(h.player().calls.includes('token-cb'), false)
    assert.equal(h.engine.getSnapshot().issue?.code, 'sign-in-required')
  })
  it('retry rebuilds the player', async () => {
    const h = makeEngine()
    await h.ready()
    h.engine.retry()
    await flush()
    assert.equal(h.players.length, 2)
    assert.equal(h.players[0]?.listenerCount(), 0)
  })
  it('reconnects when the browser comes back online', async () => {
    const h = makeEngine()
    await h.ready()
    h.player().emit('not_ready', { device_id: 'x' })
    h.engine.handleOnline()
    await flush()
    assert.equal(h.players.length, 2)
  })
})

describe('cleanup', () => {
  it('disconnect removes every listener, disconnects once and clears timers', async () => {
    const h = makeEngine()
    await h.ready()
    const p = h.player()
    p.emit('player_state_changed', state())
    assert.ok(h.timerCount() > 0)
    h.engine.disconnect()
    h.engine.disconnect()
    assert.equal(p.listenerCount(), 0)
    assert.equal(p.calls.filter((c) => c === 'disconnect').length, 1)
    assert.equal(h.timerCount(), 0)
    assert.equal(h.engine.getSnapshot().phase, 'idle')
    p.emit('ready', { device_id: 'late' })
    assert.equal(h.engine.getSnapshot().deviceId, null)
  })
  it('a connect cancelled while the SDK loads never creates a player (StrictMode)', async () => {
    const h = makeEngine()
    h.engine.connect()
    h.engine.disconnect()
    h.engine.connect()
    await flush()
    assert.equal(h.players.length, 1)
    assert.equal(h.engine.getSnapshot().phase, 'connecting')
  })
})

describe('playback state', () => {
  it('mirrors SDK state, and polls only while playing and visible', async () => {
    const h = makeEngine()
    await h.ready()
    const p = h.player()
    p.emit('player_state_changed', state({ paused: true, position: 5000 }))
    let s = h.engine.getSnapshot()
    assert.deepEqual([s.playback?.isPlaying, s.playback?.positionMs, s.isActiveDevice], [false, 5000, true])
    assert.equal(h.timerCount(), 0)

    p.emit('player_state_changed', state({ paused: false, position: 5000 }))
    assert.equal(h.timerCount(), 1)
    p.current = state({ paused: false, position: 6100 })
    h.advance(PROGRESS_POLL_MS)
    await flush()
    s = h.engine.getSnapshot()
    assert.equal(s.playback?.positionMs, 6100)

    h.setVisible(false)
    h.advance(PROGRESS_POLL_MS)
    await flush()
    assert.equal(h.timerCount(), 0)
    h.setVisible(true)
    h.engine.refresh()
    assert.equal(h.timerCount(), 1)
  })
  it('does not notify for an unchanged paused state, and clears on null', async () => {
    const h = makeEngine()
    await h.ready()
    h.player().emit('player_state_changed', state({ paused: true, position: 1000 }))
    let n = 0
    h.engine.subscribe(() => n++)
    h.player().emit('player_state_changed', state({ paused: true, position: 1100 }))
    assert.equal(n, 0)
    h.player().emit('player_state_changed', null)
    assert.equal(h.engine.getSnapshot().playback, null)
    assert.equal(h.engine.getSnapshot().isActiveDevice, false)
  })
  it('autoplay_failed and playback_error tell the person', async () => {
    const h = makeEngine()
    await h.ready()
    h.player().emit('autoplay_failed', null)
    assert.match(h.engine.getSnapshot().notice?.message ?? '', /autoplay/)
    h.player().emit('playback_error', { message: 'Failed to load' })
    assert.equal(h.engine.getSnapshot().issue?.code, 'playback-failed')
    assert.match(h.engine.getSnapshot().notice?.message ?? '', /Failed to load/)
    h.player().emit('player_state_changed', state({ paused: false }))
    assert.equal(h.engine.getSnapshot().issue, null)
  })
})

describe('starting playback', () => {
  it('transfers first when inactive, then plays, and only the SDK event marks it playing', async () => {
    const h = makeEngine()
    await h.ready('d1')
    await h.engine.start(req())
    assert.equal(h.apiCalls[0], 'transfer:d1:false')
    assert.match(h.apiCalls[1] ?? '', /^play:d1:/)
    assert.equal(h.engine.getSnapshot().playback, null)
    assert.equal(h.engine.getSnapshot().starting, false)
    assert.ok(h.player().calls.includes('activate'))
  })
  it('skips the transfer when this device is already active', async () => {
    const h = makeEngine()
    await h.ready('d1')
    h.player().emit('player_state_changed', state())
    await h.engine.start(req(2))
    assert.deepEqual(h.apiCalls.map((c) => c.split(':')[0]), ['play'])
  })
  it('drops repeated clicks, and the latest different request wins', async () => {
    const h = makeEngine()
    await h.ready('d1')
    const open = h.gateApi()
    const a = h.engine.start(req(1))
    void h.engine.start(req(1))
    void h.engine.start(req(1))
    void h.engine.start(req(2))
    void h.engine.start(req(3))
    open()
    await a
    await flush()
    const plays = h.apiCalls.filter((c) => c.startsWith('play'))
    assert.equal(plays.length, 2)
    assert.ok(plays[1]?.includes(TRACK(3)))
    assert.ok(!plays.some((c) => c.includes(TRACK(2))))
  })
  it('shows an actionable error and never fakes playback when Spotify refuses', async () => {
    const h = makeEngine()
    await h.ready('d1')
    h.player().emit('player_state_changed', state({ paused: true }))
    h.failApi(new PlaybackApiError(playbackIssues.restricted(), 403))
    await h.engine.start(req())
    const s = h.engine.getSnapshot()
    assert.equal(s.issue?.code, 'restricted')
    assert.equal(s.playback?.isPlaying, false)
    assert.equal(s.started, null)
    assert.match(s.notice?.message ?? '', /User Management/)
  })
  it('retries once on 404 after a transfer, not forever', async () => {
    const h = makeEngine()
    await h.ready('d1')
    h.player().emit('player_state_changed', state({ paused: true }))
    h.failApi(new PlaybackApiError(playbackIssues.noDevice(), 404))
    const p = h.engine.start(req())
    for (let i = 0; i < 4; i++) { await flush(); h.advance(700) }
    await p
    assert.equal(h.apiCalls.filter((c) => c.startsWith('play')).length, 2)
    assert.equal(h.engine.getSnapshot().issue?.code, 'no-device')
  })
  it('says so when the player is not ready', async () => {
    const h = makeEngine()
    await h.engine.start(req())
    assert.equal(h.apiCalls.length, 0)
    assert.match(h.engine.getSnapshot().notice?.message ?? '', /still starting/)
  })
})

describe('controls', () => {
  async function playing() {
    const h = makeEngine()
    await h.ready('d1')
    h.player().current = state({ position: 10000 })
    h.player().emit('player_state_changed', h.player().current)
    return h
  }
  it('toggle, next and previous go to the SDK once per press, and honour disallows', async () => {
    const h = await playing()
    h.engine.togglePlay()
    h.engine.togglePlay()
    assert.equal(h.player().calls.filter((c) => c === 'togglePlay').length, 1)
    await flush()
    h.engine.next()
    h.engine.previous()
    assert.ok(h.player().calls.includes('nextTrack') && h.player().calls.includes('previousTrack'))
    h.player().emit('player_state_changed', state({ disallows: { skipping_next: true, seeking: true } }))
    const before = h.player().calls.length
    h.engine.next()
    h.engine.seek(5)
    assert.equal(h.player().calls.length, before)
    assert.match(h.engine.getSnapshot().notice?.message ?? '', /isn't allowing/)
  })
  it('a stuck command is released after the guard timeout', async () => {
    const h = await playing()
    h.player().togglePlay = () => new Promise(() => {})
    h.engine.togglePlay()
    h.advance(COMMAND_GUARD_MS + 1)
    h.player().togglePlay = () => { h.player().calls.push('togglePlay2'); return Promise.resolve() }
    h.engine.togglePlay()
    assert.ok(h.player().calls.includes('togglePlay2'))
  })
  it('seek shows the position at once and sends one clamped request for a drag', async () => {
    const h = await playing()
    for (const ms of [20000, 40000, 60000, 999999]) h.engine.seek(ms)
    assert.equal(h.engine.getSnapshot().playback?.positionMs, 200000)
    assert.equal(h.player().calls.filter((c) => c.startsWith('seek')).length, 0)
    h.advance(SEEK_DEBOUNCE_MS)
    assert.deepEqual(h.player().calls.filter((c) => c.startsWith('seek')), ['seek:200000'])
    await flush()
    // A stale SDK report during a hold does not yank the thumb back.
    h.engine.seek(30000)
    h.player().emit('player_state_changed', state({ position: 11000 }))
    assert.equal(h.engine.getSnapshot().playback?.positionMs, 30000)
  })
  it('volume is clamped, coalesced, and mute restores it', async () => {
    const h = await playing()
    const p = h.player()
    h.engine.setVolume(0.2)
    h.engine.setVolume(0.4)
    h.engine.setVolume(7)
    await flush()
    assert.deepEqual(p.calls.filter((c) => c.startsWith('setVolume')), ['setVolume:0.2', 'setVolume:1'])
    h.engine.toggleMute()
    await flush()
    assert.equal(h.engine.getSnapshot().muted, true)
    assert.equal(p.calls.at(-1), 'setVolume:0')
    h.engine.toggleMute()
    await flush()
    assert.deepEqual([h.engine.getSnapshot().muted, p.calls.at(-1)], [false, 'setVolume:1'])
  })
  it('shuffle, repeat and queue use the Web API only for the active device', async () => {
    const h = await playing()
    h.engine.toggleShuffle()
    await flush()
    h.engine.cycleRepeat()
    await flush()
    h.engine.addToQueue(TRACK(4), 'Four')
    await flush()
    assert.deepEqual(h.apiCalls, ['shuffle:true:d1', 'repeat:context:d1', `queue:${TRACK(4)}:d1`])
    assert.match(h.engine.getSnapshot().notice?.message ?? '', /Added "Four"/)
    h.engine.addToQueue('sample-track', 'x')
    assert.match(h.engine.getSnapshot().notice?.message ?? '', /no Spotify link/)

    const idle = makeEngine()
    await idle.ready()
    idle.engine.toggleShuffle()
    assert.equal(idle.apiCalls.length, 0)
  })
  it('transferHere moves playback to this device', async () => {
    const h = makeEngine()
    await h.ready('d1')
    h.engine.transferHere()
    await flush()
    assert.deepEqual(h.apiCalls, ['transfer:d1:true'])
  })
})
