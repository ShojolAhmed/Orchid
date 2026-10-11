import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createSpotifyClient, type ClientDeps } from '../src/features/api/client.ts'
import { SpotifyApiError, isAbort, isInsufficientScope } from '../src/features/api/errors.ts'
import { AuthRequiredError } from '../src/features/auth/errors.ts'

type Reply = { status: number; body?: unknown; headers?: Record<string, string>; text?: string } | Error

function harness(replies: Reply[], over: Partial<ClientDeps> = {}) {
  const calls: Array<{ url: string; method: string; auth: string; body?: string }> = []
  const sleeps: number[] = []
  const tokens = { n: 0, invalidated: 0 }
  let clock = 1_000_000
  const queue = [...replies]
  const deps: ClientDeps = {
    apiBaseUrl: 'https://api.test/v1',
    getToken: async () => `tok${tokens.n++}`,
    invalidateToken: () => void (tokens.invalidated += 1),
    fetch: async (url, init) => {
      const headers = init.headers as Record<string, string>
      calls.push({ url, method: String(init.method), auth: headers.Authorization ?? '', ...(typeof init.body === 'string' ? { body: init.body } : {}) })
      if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError')
      const next = queue.shift()
      if (!next) throw new Error('unexpected request')
      if (next instanceof Error) throw next
      const text = next.text ?? (next.body === undefined ? '' : JSON.stringify(next.body))
      return new Response(next.status === 204 ? null : text, { status: next.status, headers: next.headers ?? {} })
    },
    sleep: async (ms) => {
      sleeps.push(ms)
      clock += ms
    },
    now: () => clock,
    ...over,
  }
  return { client: createSpotifyClient(deps), calls, sleeps, tokens, advance: (ms: number) => void (clock += ms) }
}

const rejects = async (promise: Promise<unknown>) => promise.then(() => assert.fail('expected rejection'), (error: unknown) => error as SpotifyApiError)

describe('api client: requests', () => {
  it('sends a bearer token and builds a stable, sorted query string', async () => {
    const h = harness([{ status: 200, body: { ok: 1 } }])
    const value = await h.client.get<{ ok: number }>('/search', { query: { q: 'a b', limit: 10, skip: undefined, type: 'track' } })
    assert.deepEqual(value, { ok: 1 })
    assert.equal(h.calls[0]?.url, 'https://api.test/v1/search?limit=10&q=a+b&type=track')
    assert.equal(h.calls[0]?.auth, 'Bearer tok0')
  })

  it('treats an empty 200/204 body as undefined (library writes)', async () => {
    const h = harness([{ status: 200 }, { status: 204 }])
    assert.equal(await h.client.put('/me/library', { query: { uris: 'spotify:track:x' } }), undefined)
    assert.equal(await h.client.delete('/me/library'), undefined)
  })

  it('maps a body that is not JSON to "malformed"', async () => {
    const h = harness([{ status: 200, text: '<html>' }])
    assert.equal((await rejects(h.client.get('/x'))).kind, 'malformed')
  })
})

describe('api client: errors map to kinds', () => {
  it('403, 404 and 400 keep Spotify\'s reason for logging only', async () => {
    const h = harness([
      { status: 403, body: { error: { status: 403, message: 'Insufficient client scope' } } },
      { status: 404, body: { error: { status: 404, message: 'Not found' } } },
      { status: 400, body: { error: { status: 400, message: 'Invalid id' } } },
    ])
    const forbidden = await rejects(h.client.get('/a'))
    assert.equal(forbidden.kind, 'forbidden')
    assert.ok(isInsufficientScope(forbidden))
    assert.equal((await rejects(h.client.get('/b'))).kind, 'not-found')
    assert.equal((await rejects(h.client.get('/c'))).kind, 'bad-request')
  })

  it('a plain 403 is not mistaken for a scope problem', async () => {
    const h = harness([{ status: 403, body: { error: { status: 403, message: 'User not registered in the Developer Dashboard' } } }])
    assert.ok(!isInsufficientScope(await rejects(h.client.get('/a'))))
  })

  it('no session becomes "signed-out" without any network call', async () => {
    const h = harness([], {
      getToken: async () => {
        throw new AuthRequiredError({ code: 'session-expired', message: 'x', retryable: false })
      },
    })
    assert.equal((await rejects(h.client.get('/a'))).kind, 'signed-out')
    assert.equal(h.calls.length, 0)
  })

  it('a network failure is "network" and is not retried', async () => {
    const h = harness([new TypeError('failed to fetch')])
    assert.equal((await rejects(h.client.get('/a'))).kind, 'network')
    assert.equal(h.calls.length, 1)
  })

  it('error messages never contain the token', async () => {
    const h = harness([{ status: 403, body: { error: { message: 'nope' } } }])
    const error = await rejects(h.client.get('/a'))
    assert.ok(!error.message.includes('tok0'))
  })
})

describe('api client: authorization failures', () => {
  it('refreshes the token once on 401 and retries', async () => {
    const h = harness([{ status: 401 }, { status: 200, body: { ok: true } }])
    assert.deepEqual(await h.client.get('/a'), { ok: true })
    assert.equal(h.tokens.invalidated, 1)
    assert.equal(h.calls[1]?.auth, 'Bearer tok1')
  })

  it('a second 401 is "unauthorized": exactly two requests, never a loop', async () => {
    const h = harness([{ status: 401 }, { status: 401 }, { status: 200, body: {} }])
    assert.equal((await rejects(h.client.get('/a'))).kind, 'unauthorized')
    assert.equal(h.calls.length, 2)
    assert.equal(h.tokens.invalidated, 1)
  })
})

describe('api client: rate limits', () => {
  it('waits out a short Retry-After once, then succeeds', async () => {
    const h = harness([{ status: 429, headers: { 'Retry-After': '2' } }, { status: 200, body: { ok: 1 } }])
    assert.deepEqual(await h.client.get('/a'), { ok: 1 })
    assert.deepEqual(h.sleeps, [2000])
  })

  it('reports a long Retry-After instead of waiting, and then refuses to hit the API during the cooldown', async () => {
    const h = harness([{ status: 429, headers: { 'Retry-After': '30' } }])
    const first = await rejects(h.client.get('/a'))
    assert.equal(first.kind, 'rate-limited')
    assert.equal(first.retryAfterSeconds, 30)
    assert.equal(h.sleeps.length, 0)
    const second = await rejects(h.client.get('/b'))
    assert.equal(second.kind, 'rate-limited')
    assert.equal(h.calls.length, 1, 'no second network request while cooling down')
    h.advance(31_000)
  })

  it('retries only once when the second answer is also 429', async () => {
    const h = harness([{ status: 429, headers: { 'Retry-After': '1' } }, { status: 429, headers: { 'Retry-After': '1' } }, { status: 200, body: {} }])
    assert.equal((await rejects(h.client.get('/a'))).kind, 'rate-limited')
    assert.equal(h.calls.length, 2)
  })

  it('QUOTA_EXCEEDED is never retried and starts a cooldown', async () => {
    const h = harness([{ status: 429, body: { error: { status: 429, message: 'Too many requests', reason: 'QUOTA_EXCEEDED' } }, headers: { 'Retry-After': '1' } }])
    assert.equal((await rejects(h.client.get('/a'))).kind, 'quota-exceeded')
    assert.equal(h.sleeps.length, 0)
    assert.equal((await rejects(h.client.get('/b'))).kind, 'rate-limited')
    assert.equal(h.calls.length, 1)
  })
})

describe('api client: server errors', () => {
  it('retries a GET once on 5xx', async () => {
    const h = harness([{ status: 503 }, { status: 200, body: { ok: 1 } }])
    assert.deepEqual(await h.client.get('/a'), { ok: 1 })
    assert.equal(h.calls.length, 2)
  })

  it('does not retry a write on 5xx (a repeated POST could create twice)', async () => {
    const h = harness([{ status: 502 }, { status: 200, body: {} }])
    assert.equal((await rejects(h.client.post('/me/playlists', { body: { name: 'x' } }))).kind, 'server')
    assert.equal(h.calls.length, 1)
  })

  it('gives up after one GET retry', async () => {
    const h = harness([{ status: 500 }, { status: 500 }, { status: 200, body: {} }])
    assert.equal((await rejects(h.client.get('/a'))).kind, 'server')
    assert.equal(h.calls.length, 2)
  })
})

describe('api client: duplicate calls and cache', () => {
  it('shares one request between identical GETs in flight', async () => {
    const h = harness([{ status: 200, body: { n: 1 } }])
    const [a, b] = await Promise.all([h.client.get('/a', { query: { x: 1 } }), h.client.get('/a', { query: { x: 1 } })])
    assert.deepEqual(a, b)
    assert.equal(h.calls.length, 1)
  })

  it('serves a repeat GET from cache within the TTL, then asks again', async () => {
    const h = harness([{ status: 200, body: { n: 1 } }, { status: 200, body: { n: 2 } }])
    assert.deepEqual(await h.client.get('/a'), { n: 1 })
    assert.deepEqual(await h.client.get('/a'), { n: 1 })
    assert.equal(h.calls.length, 1)
    h.advance(31_000)
    assert.deepEqual(await h.client.get('/a'), { n: 2 })
  })

  it('"fresh" bypasses the cache', async () => {
    const h = harness([{ status: 200, body: { n: 1 } }, { status: 200, body: { n: 2 } }])
    await h.client.get('/a')
    assert.deepEqual(await h.client.get('/a', { fresh: true }), { n: 2 })
  })

  it('does not cache failures', async () => {
    const h = harness([{ status: 403 }, { status: 200, body: { n: 1 } }])
    await rejects(h.client.get('/a'))
    assert.deepEqual(await h.client.get('/a'), { n: 1 })
  })

  it('a successful write clears the cache so the next read is fresh', async () => {
    const h = harness([{ status: 200, body: { saved: false } }, { status: 200 }, { status: 200, body: { saved: true } }])
    assert.deepEqual(await h.client.get('/me/library/contains'), { saved: false })
    await h.client.put('/me/library', { query: { uris: 'u' } })
    assert.deepEqual(await h.client.get('/me/library/contains'), { saved: true })
  })

  it('reset() forgets cached data so another account never sees it', async () => {
    const h = harness([{ status: 200, body: { who: 'A' } }, { status: 200, body: { who: 'B' } }])
    assert.deepEqual(await h.client.get('/me/tracks'), { who: 'A' })
    h.client.reset()
    assert.deepEqual(await h.client.get('/me/tracks'), { who: 'B' })
  })
})

describe('api client: cancellation', () => {
  it('an aborted caller gets an abort error that callers can ignore', async () => {
    const controller = new AbortController()
    const h = harness([{ status: 200, body: {} }])
    controller.abort()
    const error = await rejects(h.client.get('/a', { signal: controller.signal }))
    assert.ok(isAbort(error))
    assert.equal(h.calls.length, 0)
  })

  it('aborting while waiting cancels the network request once nobody wants it', async () => {
    let seenSignal: AbortSignal | undefined
    const h = harness([], {
      fetch: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          seenSignal = init.signal ?? undefined
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    })
    const controller = new AbortController()
    const pending = h.client.get('/slow', { signal: controller.signal })
    await new Promise((resolve) => setTimeout(resolve, 5))
    controller.abort()
    assert.ok(isAbort(await rejects(pending)))
    assert.equal(seenSignal?.aborted, true)
  })

  it('one caller aborting does not cancel a request another caller still needs', async () => {
    let release: (response: Response) => void = () => {}
    const h = harness([], {
      fetch: () => new Promise<Response>((resolve) => void (release = resolve)),
    })
    const first = new AbortController()
    const a = h.client.get('/shared', { signal: first.signal })
    const b = h.client.get('/shared')
    await new Promise((resolve) => setTimeout(resolve, 5))
    first.abort()
    assert.ok(isAbort(await rejects(a)))
    release(new Response(JSON.stringify({ ok: 1 }), { status: 200 }))
    assert.deepEqual(await b, { ok: 1 })
  })
})
