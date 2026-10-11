import { AUTH_RETRY_WINDOW_MS, createSpotifyEngine, type EngineDeps } from '../../src/features/player/spotify/engine.ts'
import type { SdkEventMap, SdkEventName, SdkNamespace, SdkPlayer, SdkPlayerOptions, SdkState } from '../../src/features/player/spotify/sdkTypes.ts'
import type { PlayerWebApi } from '../../src/features/player/spotify/webApi.ts'

export const TRACK = (n: number) => `spotify:track:${String(n).padStart(22, 'a')}`

export function state(over: Partial<SdkState> & { uri?: string } = {}): SdkState {
  const uri = over.uri ?? TRACK(1)
  return {
    context: { uri: null, metadata: null }, disallows: {}, paused: false, position: 0, duration: 200000, repeat_mode: 0, shuffle: false,
    track_window: { current_track: { uri, id: 'x', type: 'track', name: 'Song', album: { uri: 'spotify:album:a', name: 'Al', images: [] }, artists: [{ uri: 'spotify:artist:b', name: 'Ar' }] }, previous_tracks: [], next_tracks: [] },
    ...over,
  }
}

export const connectOutcome = { value: true }

export class FakePlayer implements SdkPlayer {
  listeners = new Map<string, Set<(p: never) => void>>()
  calls: string[] = []
  connectResult = connectOutcome.value
  current: SdkState | null = null
  token: Promise<string> | null = null
  options: SdkPlayerOptions
  constructor(options: SdkPlayerOptions) {
    this.options = options
  }
  connect() {
    this.calls.push('connect')
    this.options.getOAuthToken(() => this.calls.push('token-cb'))
    return Promise.resolve(this.connectResult)
  }
  disconnect() { this.calls.push('disconnect') }
  addListener<E extends SdkEventName>(e: E, cb: (p: SdkEventMap[E]) => void) {
    if (!this.listeners.has(e)) this.listeners.set(e, new Set())
    this.listeners.get(e)?.add(cb as (p: never) => void)
    return true
  }
  removeListener<E extends SdkEventName>(e: E, cb?: (p: SdkEventMap[E]) => void) {
    if (cb) this.listeners.get(e)?.delete(cb as (p: never) => void)
    return true
  }
  emit<E extends SdkEventName>(e: E, payload: SdkEventMap[E]) {
    for (const cb of [...(this.listeners.get(e) ?? [])]) (cb as (p: SdkEventMap[E]) => void)(payload)
  }
  listenerCount() { let n = 0; for (const s of this.listeners.values()) n += s.size; return n }
  getCurrentState() { this.calls.push('getCurrentState'); return Promise.resolve(this.current) }
  setVolume(v: number) { this.calls.push(`setVolume:${v}`); return Promise.resolve() }
  pause() { return Promise.resolve() }
  resume() { return Promise.resolve() }
  togglePlay() { this.calls.push('togglePlay'); return Promise.resolve() }
  seek(ms: number) { this.calls.push(`seek:${ms}`); return Promise.resolve() }
  previousTrack() { this.calls.push('previousTrack'); return Promise.resolve() }
  nextTrack() { this.calls.push('nextTrack'); return Promise.resolve() }
  activateElement() { this.calls.push('activate'); return Promise.resolve() }
}

export const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }

export function makeEngine(overrides: Partial<EngineDeps> = {}) {
  const players: FakePlayer[] = []
  const apiCalls: string[] = []
  let apiFail: Error | null = null
  let apiGate: Promise<void> | null = null
  const sdk = { Player: class extends FakePlayer { constructor(o: SdkPlayerOptions) { super(o); players.push(this) } } } as unknown as SdkNamespace
  const api: PlayerWebApi = {
    transfer: async (d, play) => { apiCalls.push(`transfer:${d}:${play}`); await apiGate; if (apiFail) throw apiFail },
    play: async (b, d) => { apiCalls.push(`play:${d}:${JSON.stringify(b)}`); await apiGate; if (apiFail) throw apiFail },
    addToQueue: async (u, d) => { apiCalls.push(`queue:${u}:${d}`); if (apiFail) throw apiFail },
    setShuffle: async (on, d) => { apiCalls.push(`shuffle:${on}:${d}`); if (apiFail) throw apiFail },
    setRepeat: async (s, d) => { apiCalls.push(`repeat:${s}:${d}`); if (apiFail) throw apiFail },
  }
  // Manual clock: timers run only when the test advances time.
  let now = 1_000_000
  let nextId = 1
  const timers = new Map<number, { at: number; every: number | null; cb: () => void }>()
  const clock = {
    setInterval: (cb: () => void, ms: number) => { const id = nextId++; timers.set(id, { at: now + ms, every: ms, cb }); return id },
    clearInterval: (id: unknown) => void timers.delete(id as number),
    setTimeout: (cb: () => void, ms: number) => { const id = nextId++; timers.set(id, { at: now + ms, every: null, cb }); return id },
    clearTimeout: (id: unknown) => void timers.delete(id as number),
  }
  let visible = true
  let loads = 0
  const tokens = { calls: 0, invalidated: 0, fail: null as Error | null }
  const engine = createSpotifyEngine({
    deviceName: 'Test Player', initialVolume: 0.7,
    loadSdk: () => { loads++; return Promise.resolve(sdk) },
    getToken: () => { tokens.calls++; return tokens.fail ? Promise.reject(tokens.fail) : Promise.resolve('TOKEN') },
    invalidateToken: () => void tokens.invalidated++,
    api, timers: clock, isVisible: () => visible, now: () => now, ...overrides,
  })
  return {
    engine, players, apiCalls, tokens, timerCount: () => timers.size,
    loads: () => loads,
    player: () => players[players.length - 1] as FakePlayer,
    failApi: (e: Error | null) => { apiFail = e },
    gateApi: () => { let open = () => {}; apiGate = new Promise<void>((r) => (open = r)); return () => { apiGate = null; open() } },
    setVisible: (v: boolean) => { visible = v },
    advance(ms: number) {
      const end = now + ms
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        const [id, t] = due
        now = t.at
        if (t.every === null) timers.delete(id)
        else t.at += t.every
        t.cb()
      }
      now = end
    },
    skipAuthWindow() { now += AUTH_RETRY_WINDOW_MS + 1 },
    async ready(deviceId = 'dev1') {
      engine.connect()
      await flush()
      this.player().emit('ready', { device_id: deviceId })
    },
  }
}
