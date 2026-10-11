import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AuthRequiredError } from '../src/features/auth/errors.ts'
import { createSdkLoader, SDK_URL } from '../src/features/player/spotify/sdkLoader.ts'
import type { SdkHost, SdkNamespace } from '../src/features/player/spotify/sdkTypes.ts'
import { createPlayerWebApi, PlaybackApiError } from '../src/features/player/spotify/webApi.ts'

function loaderEnv() {
  const host: SdkHost = {}
  const added: string[] = []
  let fail: () => void = () => {}
  let removed = 0
  let timeout: () => void = () => {}
  const loader = createSdkLoader({
    host,
    addScript(src, onError) {
      added.push(src)
      fail = onError
      // The callback must already be installed when the script is added.
      assert.equal(typeof host.onSpotifyWebPlaybackSDKReady, 'function')
      return () => void removed++
    },
    setTimeout: (cb) => ((timeout = cb), 1),
    clearTimeout: () => {},
  })
  return { host, added, loader, fail: () => fail(), timeout: () => timeout(), removed: () => removed }
}
const sdk = { Player: class {} } as unknown as SdkNamespace

describe('sdk loader', () => {
  it('loads the script once and shares the promise', async () => {
    const e = loaderEnv()
    const a = e.loader()
    const b = e.loader()
    assert.deepEqual(e.added, [SDK_URL])
    e.host.Spotify = sdk
    e.host.onSpotifyWebPlaybackSDKReady?.()
    assert.equal(await a, sdk)
    assert.equal(await b, sdk)
    assert.equal(await e.loader(), sdk)
    assert.equal(e.added.length, 1)
  })
  it('rejects on script error, removes the tag and allows a clean retry', async () => {
    const e = loaderEnv()
    const first = e.loader()
    e.fail()
    await assert.rejects(first, { name: 'SdkLoadError' })
    assert.equal(e.removed(), 1)
    const second = e.loader()
    assert.equal(e.added.length, 2)
    e.host.Spotify = sdk
    e.host.onSpotifyWebPlaybackSDKReady?.()
    assert.equal(await second, sdk)
  })
  it('rejects on timeout', async () => {
    const e = loaderEnv()
    const p = e.loader()
    e.timeout()
    await assert.rejects(p, /Timed out/)
  })
})

interface Call { url: string; method: string; headers: Record<string, string>; body?: string }
function apiHarness(responses: Array<Response | Error>, tokens: Array<string | Error> = ['T1', 'T2']) {
  const calls: Call[] = []
  let invalidated = 0
  const api = createPlayerWebApi({
    apiBaseUrl: 'https://api.spotify.com/v1',
    getToken: async () => {
      const t = tokens.shift() ?? 'T9'
      if (t instanceof Error) throw t
      return t
    },
    invalidateToken: () => void invalidated++,
    fetch: async (url, init) => {
      calls.push({ url, method: String(init.method), headers: init.headers as Record<string, string>, ...(typeof init.body === 'string' ? { body: init.body } : {}) })
      const r = responses.shift() ?? new Response(null, { status: 204 })
      if (r instanceof Error) throw r
      return r
    },
  })
  return { api, calls, invalidated: () => invalidated }
}
const err = (status: number, body?: unknown, headers?: Record<string, string>) => new Response(body ? JSON.stringify(body) : null, { status, ...(headers ? { headers } : {}) })

describe('player web api', () => {
  it('sends documented requests with a bearer token', async () => {
    const h = apiHarness([])
    await h.api.transfer('dev', false)
    await h.api.play({ uris: ['spotify:track:x'] }, 'dev')
    await h.api.addToQueue('spotify:track:x', 'dev')
    await h.api.setShuffle(true, 'dev')
    await h.api.setRepeat('context', 'dev')
    assert.deepEqual(h.calls.map((c) => `${c.method} ${c.url.replace('https://api.spotify.com/v1', '')}`), [
      'PUT /me/player',
      'PUT /me/player/play?device_id=dev',
      'POST /me/player/queue?uri=spotify%3Atrack%3Ax&device_id=dev',
      'PUT /me/player/shuffle?state=true&device_id=dev',
      'PUT /me/player/repeat?state=context&device_id=dev',
    ])
    assert.equal(h.calls[0]?.body, JSON.stringify({ device_ids: ['dev'], play: false }))
    assert.equal(h.calls[0]?.headers.Authorization, 'Bearer T1')
  })
  it('retries once with a fresh token after a 401', async () => {
    const h = apiHarness([err(401), new Response(null, { status: 204 })])
    await h.api.setShuffle(false, 'd')
    assert.equal(h.invalidated(), 1)
    assert.equal(h.calls.length, 2)
    assert.equal(h.calls[1]?.headers.Authorization, 'Bearer T2')
    const bad = apiHarness([err(401), err(401)])
    await assert.rejects(bad.api.setShuffle(false, 'd'), (e: PlaybackApiError) => e.issue.code === 'authentication')
  })
  it('classifies failures into actionable issues', async () => {
    const code = async (r: Response | Error) => {
      try {
        await apiHarness([r]).api.play({}, 'd')
      } catch (e) {
        return (e as PlaybackApiError).issue.code
      }
      return 'ok'
    }
    assert.equal(await code(err(403, { error: { status: 403, reason: 'PREMIUM_REQUIRED' } })), 'premium-required')
    assert.equal(await code(err(403)), 'restricted')
    assert.equal(await code(err(404)), 'no-device')
    assert.equal(await code(err(429, undefined, { 'Retry-After': '7' })), 'rate-limited')
    assert.equal(await code(err(503)), 'service')
    assert.equal(await code(new TypeError('offline')), 'network')
  })
  it('reports 429 Retry-After and a missing session', async () => {
    await assert.rejects(apiHarness([err(429, undefined, { 'Retry-After': '7' })]).api.play({}, 'd'), (e: PlaybackApiError) => e.retryAfterSeconds === 7 && e.issue.message.includes('7 seconds'))
    const signedOut = new AuthRequiredError({ code: 'session-expired', message: 'x', retryable: false })
    await assert.rejects(apiHarness([], [signedOut]).api.play({}, 'd'), (e: PlaybackApiError) => e.issue.code === 'sign-in-required')
  })
})
