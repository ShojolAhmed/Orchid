import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { spotifyConfig } from '../../config/spotify'
import { useAuth } from '../auth'
import { createSpotifyEngine, type EngineSnapshot, type SpotifyEngine } from './spotify/engine'
import { playbackMessages } from './spotify/playbackIssues'
import { toPlayerState } from './spotify/playbackMap'
import { createSdkLoader } from './spotify/sdkLoader'
import type { SdkHost } from './spotify/sdkTypes'
import { buildLinkRequest, buildStartRequest } from './spotify/startRequest'
import { createPlayerWebApi } from './spotify/webApi'
import type { PlaybackStatus, PlayerActions, PlayerApi } from './types'

const INITIAL_VOLUME = 0.7

/** One SDK script per page, however many times the engine is created (hot reload, StrictMode). */
let sdkLoader: ReturnType<typeof createSdkLoader> | undefined
function getSdkLoader() {
  sdkLoader ??= createSdkLoader({
    host: window as unknown as SdkHost,
    addScript(src, onError) {
      const script = document.createElement('script')
      script.src = src
      script.async = true
      script.addEventListener('error', onError)
      document.head.appendChild(script)
      return () => script.remove()
    },
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
  })
  return sdkLoader
}

function createBrowserEngine(getToken: () => Promise<string>, invalidateToken: () => void): SpotifyEngine {
  return createSpotifyEngine({
    deviceName: spotifyConfig.deviceName,
    initialVolume: INITIAL_VOLUME,
    loadSdk: () => getSdkLoader()(),
    getToken,
    invalidateToken,
    api: createPlayerWebApi({ apiBaseUrl: spotifyConfig.apiBaseUrl, getToken, invalidateToken, fetch: (input, init) => fetch(input, init) }),
    timers: {
      setInterval: (callback, ms) => window.setInterval(callback, ms),
      clearInterval: (handle) => window.clearInterval(handle as number),
      setTimeout: (callback, ms) => window.setTimeout(callback, ms),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
    },
    isVisible: () => document.visibilityState !== 'hidden',
    now: () => Date.now(),
  })
}

export function toPlaybackStatus(snap: Pick<EngineSnapshot, 'phase' | 'deviceName' | 'isActiveDevice' | 'starting' | 'issue'>): PlaybackStatus {
  const base = { deviceName: snap.deviceName, isActiveDevice: snap.isActiveDevice, busy: snap.starting }
  switch (snap.phase) {
    case 'ready':
      return {
        ...base,
        availability: 'ready',
        label: snap.isActiveDevice ? `Playing on ${snap.deviceName}` : `${snap.deviceName} is ready`,
        detail: snap.issue ? snap.issue.message : `To hear Spotify here from another device, choose “${snap.deviceName}” in that device's Spotify menu.`,
        action: snap.issue?.action ?? (snap.isActiveDevice ? null : 'play-here'),
      }
    case 'reconnecting':
      return { ...base, availability: 'reconnecting', label: 'Reconnecting to Spotify…', detail: snap.issue?.message ?? null, action: snap.issue?.action ?? null }
    case 'error':
      return { ...base, availability: 'error', label: 'Spotify player unavailable', detail: snap.issue?.message ?? null, action: snap.issue?.action ?? null }
    case 'connecting':
      return { ...base, availability: 'connecting', label: 'Connecting to Spotify…', detail: null, action: null }
    default:
      return { ...base, availability: 'loading', label: 'Starting the Spotify player…', detail: null, action: null }
  }
}

/**
 * Binds the framework-free Spotify engine to React and implements `PlayerApi` with real playback.
 * The engine exists for the life of the provider but only connects while `enabled` is true, so
 * navigating between pages never recreates the player and signing out disconnects it.
 */
export function useSpotifyPlayer(enabled: boolean): PlayerApi {
  // The auth actions are stable (they belong to the page's single session), so the engine can keep them.
  const { actions: auth } = useAuth()
  const [engine] = useState(() => createBrowserEngine(auth.getAccessToken, auth.invalidateAccessToken))
  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot)

  useEffect(() => {
    if (!enabled) return
    engine.connect()
    return () => engine.disconnect()
  }, [enabled, engine])

  useEffect(() => {
    if (!enabled) return
    const onVisibility = () => engine.refresh()
    const onOnline = () => engine.handleOnline()
    // Browsers only unlock audio after a user gesture, so the first click or key press activates the player.
    const onGesture = () => engine.activate()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    document.addEventListener('pointerdown', onGesture, true)
    document.addEventListener('keydown', onGesture, true)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('pointerdown', onGesture, true)
      document.removeEventListener('keydown', onGesture, true)
    }
  }, [enabled, engine])

  const actions = useMemo<PlayerActions>(
    () => ({
      playTracks: (tracks, options) => {
        const result = buildStartRequest(tracks, options)
        if (!result.ok) {
          engine.notify(playbackMessages.noPlayableUri, 8000)
          return
        }
        void engine.start(result.request)
      },
      togglePlay: engine.togglePlay,
      next: engine.next,
      previous: engine.previous,
      seek: engine.seek,
      setVolume: engine.setVolume,
      toggleMute: engine.toggleMute,
      toggleShuffle: engine.toggleShuffle,
      cycleRepeat: engine.cycleRepeat,
      addToQueue: (track) => (track.uri ? engine.addToQueue(track.uri, track.title) : engine.notify(playbackMessages.noPlayableUri, 8000)),
      removeFromQueue: () => engine.notify(playbackMessages.queueUnsupportedRemove),
      clearQueue: () => engine.notify(playbackMessages.queueUnsupportedRemove),
      playQueued: (list, index) => {
        if (list === 'next') engine.skipAhead(index + 1)
      },
      playSpotifyLink: (input) => {
        const result = buildLinkRequest(input)
        if (result.ok) void engine.start(result.request)
        else engine.notify(result.reason === 'not-music' ? playbackMessages.linkNotMusic : playbackMessages.unsupportedLink)
      },
      playHere: engine.transferHere,
      retryPlayer: engine.retry,
      notify: engine.notify,
    }),
    [engine],
  )

  const state = useMemo(() => toPlayerState(snap.playback, snap.volume, snap.muted, snap.started), [snap.playback, snap.volume, snap.muted, snap.started])
  // Only these snapshot fields feed the status, so progress ticks do not rebuild it.
  const { phase, deviceName, isActiveDevice, starting, issue } = snap
  const status = useMemo(() => toPlaybackStatus({ phase, deviceName, isActiveDevice, starting, issue }), [phase, deviceName, isActiveDevice, starting, issue])
  const notice = snap.notice?.message ?? null

  return useMemo<PlayerApi>(() => ({ engine: 'spotify', state, actions, status, notice }), [state, actions, status, notice])
}
