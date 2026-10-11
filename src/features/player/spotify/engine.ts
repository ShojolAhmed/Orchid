import { AuthRequiredError } from '../../auth/errors.ts'
import { toPlaybackView, sameView, type PlaybackView, type StartedContext } from './playbackMap.ts'
import { playbackIssues, playbackMessages, type PlaybackIssue } from './playbackIssues.ts'
import type { SdkEventMap, SdkEventName, SdkNamespace, SdkPlayer, SdkState } from './sdkTypes.ts'
import type { StartRequest } from './startRequest.ts'
import { isTrackUri } from './uris.ts'
import { PlaybackApiError, type PlayerWebApi, type RepeatApiState } from './webApi.ts'

/**
 * The Spotify player, without React. It owns the SDK `Player` lifecycle, listens to the SDK's own
 * events, and exposes an immutable snapshot for the UI. Nothing here simulates playback: the position,
 * track and play/pause state only ever come from what the SDK reports, and a failed request leaves the
 * state untouched and tells the person why.
 *
 * Division of labour (Spotify's rules, not ours): the SDK controls its own device (play/pause, seek,
 * volume, next, previous). Starting content, transferring playback, shuffle, repeat and the queue need
 * Web API requests (`webApi.ts`), which are only valid for an active device and a Premium account.
 */

export const PROGRESS_POLL_MS = 1000
export const SEEK_DEBOUNCE_MS = 150
export const NOTICE_MS = 4500
export const COMMAND_GUARD_MS = 4000
export const NO_DEVICE_RETRY_MS = 600
export const AUTH_RETRY_WINDOW_MS = 60_000
const MAX_SKIP_AHEAD = 20

export type EnginePhase = 'idle' | 'loading-sdk' | 'connecting' | 'ready' | 'reconnecting' | 'error'

export interface EngineSnapshot {
  phase: EnginePhase
  deviceId: string | null
  deviceName: string
  /** The SDK has reported local playback state, so Spotify treats this browser as the active device. */
  isActiveDevice: boolean
  /** The latest problem that affects playback. Cleared when audio is actually playing again. */
  issue: PlaybackIssue | null
  /** A start-playback or transfer request is in flight. */
  starting: boolean
  playback: PlaybackView | null
  /** What the last successful start request asked for; used only to label the context. */
  started: StartedContext | null
  volume: number
  muted: boolean
  notice: { id: number; message: string } | null
}

export interface EngineTimers {
  setInterval(callback: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
  setTimeout(callback: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export interface EngineDeps {
  deviceName: string
  initialVolume: number
  loadSdk(): Promise<SdkNamespace>
  /** Backed by the existing auth session. The engine never refreshes tokens itself. */
  getToken(): Promise<string>
  invalidateToken(): void
  api: PlayerWebApi
  timers: EngineTimers
  isVisible(): boolean
  now(): number
}

export interface SpotifyEngine {
  subscribe(listener: () => void): () => void
  getSnapshot(): EngineSnapshot
  /** Safe to call repeatedly: does nothing while a session exists. */
  connect(): void
  /** Removes listeners, disconnects the player and returns to `idle`. Safe to call repeatedly. */
  disconnect(): void
  retry(): void
  start(request: StartRequest): Promise<void>
  togglePlay(): void
  next(): void
  previous(): void
  seek(positionMs: number): void
  setVolume(volume: number): void
  toggleMute(): void
  toggleShuffle(): void
  cycleRepeat(): void
  addToQueue(uri: string, title: string): void
  /** Skips forward `count` tracks (the SDK has no "jump to queue item"). */
  skipAhead(count: number): void
  transferHere(): void
  /** Unlocks audio in browsers that need a user gesture. Call from a click or key press. */
  activate(): void
  /** Re-reads playback now (the tab became visible again). */
  refresh(): void
  handleOnline(): void
  notify(message: string, durationMs?: number): void
}

interface Session {
  player: SdkPlayer | null
  detach: () => void
  activated: boolean
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const RETRYABLE_ERROR_CODES = new Set(['sdk-load-failed', 'connect-failed', 'network'])

export function createSpotifyEngine(deps: EngineDeps): SpotifyEngine {
  let snap: EngineSnapshot = {
    phase: 'idle',
    deviceId: null,
    deviceName: deps.deviceName,
    isActiveDevice: false,
    issue: null,
    starting: false,
    playback: null,
    started: null,
    volume: clamp(deps.initialVolume, 0, 1),
    muted: false,
    notice: null,
  }
  const listeners = new Set<() => void>()
  let session: Session | null = null

  let pollHandle: unknown = null
  let noticeHandle: unknown = null
  let noticeId = 0
  let lastAuthRetryAt = Number.NEGATIVE_INFINITY

  let inFlight: StartRequest | null = null
  let queued: StartRequest | null = null
  const busy = new Set<string>()

  let seekTarget: number | null = null
  let seekHandle: unknown = null
  let seeksInFlight = 0

  let volumeBusy = false
  let volumeQueued: number | null = null

  function set(patch: Partial<EngineSnapshot>) {
    snap = { ...snap, ...patch }
    for (const listener of [...listeners]) listener()
  }

  function notify(message: string, durationMs = NOTICE_MS) {
    deps.timers.clearTimeout(noticeHandle)
    set({ notice: { id: ++noticeId, message } })
    noticeHandle = deps.timers.setTimeout(() => set({ notice: null }), durationMs)
  }

  function notReadyMessage(): string {
    return snap.issue && snap.phase === 'error' ? snap.issue.message : playbackMessages.notReady
  }

  /* ---------- polling: real progress, read from the SDK ---------- */

  function stopPolling() {
    if (pollHandle !== null) deps.timers.clearInterval(pollHandle)
    pollHandle = null
  }

  function syncPolling() {
    const should = Boolean(session?.player) && snap.playback?.isPlaying === true && deps.isVisible()
    if (should && pollHandle === null) pollHandle = deps.timers.setInterval(refresh, PROGRESS_POLL_MS)
    else if (!should) stopPolling()
  }

  function refresh() {
    const current = session
    if (!current?.player) return
    current.player.getCurrentState().then(
      (state) => {
        if (session === current) applyState(state)
      },
      () => {},
    )
    syncPolling()
  }

  function seekHolding(): boolean {
    return seekHandle !== null || seeksInFlight > 0
  }

  function applyState(state: SdkState | null) {
    if (!state) {
      // Nothing is playing on this device (playback moved to another device, or ended).
      stopPolling()
      if (snap.playback || snap.isActiveDevice) set({ playback: null, isActiveDevice: false })
      return
    }
    let view = toPlaybackView(state)
    const previous = snap.playback
    // While the person is dragging the seek bar, keep their position rather than the SDK's stale one.
    if (previous && seekHolding() && previous.track.uri === view.track.uri) view = { ...view, positionMs: previous.positionMs }
    if (previous && snap.isActiveDevice && sameView(previous, view) && !(snap.issue && view.isPlaying)) return
    set({ playback: view, isActiveDevice: true, ...(view.isPlaying && snap.issue ? { issue: null } : {}) })
    syncPolling()
  }

  /* ---------- session lifecycle ---------- */

  function closeSession() {
    const closing = session
    session = null
    if (closing) {
      closing.detach()
      try {
        closing.player?.disconnect()
      } catch {
        // already closed
      }
    }
    stopPolling()
    deps.timers.clearTimeout(seekHandle)
    seekHandle = null
    seekTarget = null
    seeksInFlight = 0
    busy.clear()
    inFlight = null
    queued = null
    volumeBusy = false
    volumeQueued = null
  }

  function failSession(issue: PlaybackIssue) {
    closeSession()
    set({ phase: 'error', issue, deviceId: null, isActiveDevice: false, playback: null, starting: false })
  }

  function onAuthenticationError() {
    deps.invalidateToken()
    const now = deps.now()
    if (now - lastAuthRetryAt > AUTH_RETRY_WINDOW_MS) {
      // One fresh attempt with a newly issued token before bothering the person.
      lastAuthRetryAt = now
      closeSession()
      connect()
      return
    }
    failSession(playbackIssues.authentication())
  }

  function provideToken(current: Session, callback: (token: string) => void) {
    deps.getToken().then(
      (token) => {
        if (session === current) callback(token)
      },
      (error: unknown) => {
        // Never call back with an empty token: the SDK would treat that as an authentication failure.
        if (session !== current) return
        failSession(error instanceof AuthRequiredError ? playbackIssues.signInRequired() : playbackIssues.network())
      },
    )
  }

  function openPlayer(sdk: SdkNamespace, current: Session) {
    set({ phase: 'connecting' })
    let player: SdkPlayer
    try {
      player = new sdk.Player({
        name: deps.deviceName,
        volume: snap.muted ? 0 : snap.volume,
        getOAuthToken: (callback) => provideToken(current, callback),
      })
    } catch {
      failSession(playbackIssues.unsupportedBrowser())
      return
    }
    current.player = player

    const removers: Array<() => void> = []
    const on = <E extends SdkEventName>(name: E, handler: (payload: SdkEventMap[E]) => void) => {
      player.addListener(name, handler)
      removers.push(() => player.removeListener(name, handler))
    }
    const live = (callback: () => void) => () => {
      if (session === current) callback()
    }

    on('ready', ({ device_id }) => {
      if (session !== current) return
      set({ phase: 'ready', deviceId: device_id, ...(snap.issue?.code === 'offline' ? { issue: null } : {}) })
    })
    on(
      'not_ready',
      live(() => {
        stopPolling()
        set({ phase: 'reconnecting', isActiveDevice: false, issue: playbackIssues.offline() })
      }),
    )
    on('player_state_changed', (state) => {
      if (session === current) applyState(state)
    })
    on('autoplay_failed', live(() => notify(playbackMessages.autoplayBlocked)))
    on('initialization_error', live(() => failSession(playbackIssues.unsupportedBrowser())))
    on('authentication_error', live(onAuthenticationError))
    on('account_error', live(() => failSession(playbackIssues.premiumRequired())))
    on('playback_error', ({ message }) => {
      if (session !== current) return
      const issue = playbackIssues.playbackFailed(message)
      set({ issue, starting: false })
      notify(issue.message)
    })
    current.detach = () => {
      for (const remove of removers) remove()
    }

    player.connect().then(
      (ok) => {
        if (session === current && !ok && snap.phase !== 'error') failSession(playbackIssues.connectFailed())
      },
      () => {
        if (session === current && snap.phase !== 'error') failSession(playbackIssues.connectFailed())
      },
    )
  }

  function connect() {
    if (session) return
    const current: Session = { player: null, detach: () => {}, activated: false }
    session = current
    set({ phase: 'loading-sdk', issue: null })
    deps.loadSdk().then(
      (sdk) => {
        if (session === current) openPlayer(sdk, current)
      },
      () => {
        if (session === current) failSession(playbackIssues.sdkLoadFailed())
      },
    )
  }

  function disconnect() {
    closeSession()
    if (snap.phase === 'idle' && !snap.deviceId && !snap.playback) return
    set({ phase: 'idle', deviceId: null, isActiveDevice: false, playback: null, started: null, starting: false, issue: null })
  }

  function retry() {
    closeSession()
    set({ issue: null, deviceId: null, isActiveDevice: false, playback: null, starting: false })
    connect()
  }

  function handleOnline() {
    if (snap.phase === 'reconnecting' || (snap.phase === 'error' && snap.issue && RETRYABLE_ERROR_CODES.has(snap.issue.code))) retry()
  }

  /* ---------- commands ---------- */

  function activate() {
    const current = session
    if (!current?.player || current.activated) return
    current.activated = true
    current.player.activateElement().catch(() => {
      current.activated = false
    })
  }

  /** At most one command of each kind at a time, with a safety release so a hung promise cannot wedge a button. */
  function guarded(name: string, run: () => Promise<void>, onError: (error: unknown) => void) {
    if (busy.has(name)) return
    busy.add(name)
    let timer: unknown
    const release = () => {
      deps.timers.clearTimeout(timer)
      busy.delete(name)
    }
    timer = deps.timers.setTimeout(release, COMMAND_GUARD_MS)
    run().catch(onError).finally(release)
  }

  function handleFailure(error: unknown) {
    if (error instanceof PlaybackApiError) {
      set({ issue: error.issue })
      notify(error.issue.message)
      return
    }
    notify(playbackMessages.commandFailed)
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => deps.timers.setTimeout(resolve, ms))
  }

  async function playWithOneRetry(request: StartRequest, deviceId: string) {
    try {
      await deps.api.play(request.body, deviceId)
    } catch (error) {
      // Right after a transfer Spotify can briefly answer 404 for the new device. One retry, no loop.
      if (error instanceof PlaybackApiError && error.status === 404) {
        await sleep(NO_DEVICE_RETRY_MS)
        await deps.api.play(request.body, deviceId)
        return
      }
      throw error
    }
  }

  async function run(request: StartRequest) {
    const deviceId = snap.deviceId
    if (!deviceId) return
    try {
      if (!snap.isActiveDevice) await deps.api.transfer(deviceId, false)
      await playWithOneRetry(request, deviceId)
      set({ started: { contextUri: request.contextUri, contextId: request.contextId, label: request.label }, issue: null })
      // The SDK reports the new track through `player_state_changed`; read once in case that event is late.
      refresh()
    } catch (error) {
      handleFailure(error)
    }
  }

  function start(request: StartRequest): Promise<void> {
    if (!session?.player || snap.phase !== 'ready' || !snap.deviceId) {
      notify(notReadyMessage())
      return Promise.resolve()
    }
    // Synchronous with the caller's click, which is what browser autoplay rules look at.
    activate()
    if (inFlight) {
      // The same request twice is a double click: drop it. A different one replaces whatever was waiting.
      if (inFlight.key !== request.key) queued = request
      return Promise.resolve()
    }
    inFlight = request
    set({ starting: true })
    return run(request).finally(() => {
      inFlight = null
      const waiting = queued
      queued = null
      set({ starting: false })
      if (waiting) void start(waiting)
    })
  }

  function togglePlay() {
    const player = session?.player
    const view = snap.playback
    if (!player || snap.phase !== 'ready') return notify(notReadyMessage())
    if (!view) return notify(playbackMessages.nothingToPlay)
    if (view.isPlaying ? view.disallows.pausing : view.disallows.resuming) return notify(playbackMessages.notAllowed)
    activate()
    // The UI changes when the SDK reports the new state, not when the button is pressed.
    guarded('toggle', () => player.togglePlay(), () => notify(playbackMessages.commandFailed))
  }

  function skip(direction: 'next' | 'previous') {
    const player = session?.player
    const view = snap.playback
    if (!player || snap.phase !== 'ready') return notify(notReadyMessage())
    if (!view) return notify(playbackMessages.nothingToPlay)
    if (direction === 'next' ? view.disallows.skipping_next : view.disallows.skipping_prev) return notify(playbackMessages.notAllowed)
    guarded(direction, () => (direction === 'next' ? player.nextTrack() : player.previousTrack()), () => notify(playbackMessages.commandFailed))
  }

  function flushSeek() {
    seekHandle = null
    const target = seekTarget
    const current = session
    seekTarget = null
    if (target === null || !current?.player) return
    seeksInFlight++
    current.player
      .seek(target)
      .catch(() => {
        if (session === current) notify(playbackMessages.commandFailed)
      })
      .finally(() => {
        seeksInFlight = Math.max(0, seeksInFlight - 1)
        if (session === current) refresh()
      })
  }

  function seek(positionMs: number) {
    const view = snap.playback
    if (!session?.player || !view) return notify(playbackMessages.nothingToPlay)
    if (view.disallows.seeking) return notify(playbackMessages.notAllowed)
    const target = clamp(Math.round(positionMs), 0, view.durationMs)
    seekTarget = target
    // Show the new position immediately; one trailing request carries the final value of a drag.
    set({ playback: { ...view, positionMs: target } })
    deps.timers.clearTimeout(seekHandle)
    seekHandle = deps.timers.setTimeout(flushSeek, SEEK_DEBOUNCE_MS)
  }

  function pushVolume(value: number) {
    const player = session?.player
    if (!player) return
    if (volumeBusy) {
      volumeQueued = value
      return
    }
    volumeBusy = true
    player
      .setVolume(value)
      .catch(() => notify(playbackMessages.commandFailed))
      .finally(() => {
        volumeBusy = false
        if (volumeQueued !== null) {
          const latest = volumeQueued
          volumeQueued = null
          pushVolume(latest)
        }
      })
  }

  function setVolume(volume: number) {
    const value = clamp(volume, 0, 1)
    set({ volume: value, muted: false })
    pushVolume(value)
  }

  function toggleMute() {
    if (snap.muted) {
      const restored = snap.volume > 0 ? snap.volume : 0.5
      set({ muted: false, volume: restored })
      pushVolume(restored)
    } else {
      set({ muted: true })
      pushVolume(0)
    }
  }

  /** Shuffle, repeat and queue changes only apply to the device Spotify considers active. */
  function requireActiveDevice(): string | null {
    if (snap.phase !== 'ready' || !snap.deviceId) {
      notify(notReadyMessage())
      return null
    }
    if (!snap.playback || !snap.isActiveDevice) {
      notify(snap.playback ? playbackMessages.notActive : playbackMessages.nothingToPlay)
      return null
    }
    return snap.deviceId
  }

  function toggleShuffle() {
    const deviceId = requireActiveDevice()
    const view = snap.playback
    if (!deviceId || !view) return
    guarded(
      'shuffle',
      async () => {
        await deps.api.setShuffle(!view.shuffle, deviceId)
        refresh()
      },
      handleFailure,
    )
  }

  function cycleRepeat() {
    const deviceId = requireActiveDevice()
    const view = snap.playback
    if (!deviceId || !view) return
    const nextState: RepeatApiState = view.repeat === 'off' ? 'context' : view.repeat === 'all' ? 'track' : 'off'
    guarded(
      'repeat',
      async () => {
        await deps.api.setRepeat(nextState, deviceId)
        refresh()
      },
      handleFailure,
    )
  }

  function addToQueue(uri: string, title: string) {
    if (!isTrackUri(uri)) return notify(playbackMessages.noPlayableUri)
    const deviceId = requireActiveDevice()
    if (!deviceId) return
    guarded(
      `queue|${uri}`,
      async () => {
        await deps.api.addToQueue(uri, deviceId)
        notify(`Added "${title}" to queue`)
        refresh()
      },
      handleFailure,
    )
  }

  function skipAhead(count: number) {
    const player = session?.player
    if (!player || snap.phase !== 'ready') return notify(notReadyMessage())
    if (!snap.playback) return notify(playbackMessages.nothingToPlay)
    const steps = clamp(Math.floor(count), 1, MAX_SKIP_AHEAD)
    guarded(
      'skip-ahead',
      async () => {
        for (let step = 0; step < steps; step++) await player.nextTrack()
        refresh()
      },
      () => notify(playbackMessages.commandFailed),
    )
  }

  function transferHere() {
    const deviceId = snap.deviceId
    if (!session?.player || snap.phase !== 'ready' || !deviceId) return notify(notReadyMessage())
    activate()
    guarded(
      'transfer',
      async () => {
        set({ starting: true })
        try {
          await deps.api.transfer(deviceId, true)
          set({ issue: snap.issue?.code === 'no-device' ? null : snap.issue })
          refresh()
        } finally {
          set({ starting: false })
        }
      },
      handleFailure,
    )
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snap,
    connect,
    disconnect,
    retry,
    start,
    togglePlay,
    next: () => skip('next'),
    previous: () => skip('previous'),
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    addToQueue,
    skipAhead,
    transferHere,
    activate,
    refresh() {
      refresh()
    },
    handleOnline,
    notify,
  }
}
