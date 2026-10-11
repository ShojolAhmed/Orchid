import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { AuthRequiredError } from '../src/features/auth/errors.ts'
import { CREDENTIALS_KEY } from '../src/features/auth/storage.ts'
import { createFakeLocks, createHarness, json, MemoryStorage, tick, tokenBody, type Harness, type RecordedRequest } from './helpers/auth-harness.ts'

const isToken = (request: RecordedRequest) => request.url.endsWith('/api/token')
const refreshes = (h: Harness) => h.requests.filter((request) => isToken(request) && request.body?.get('grant_type') === 'refresh_token')

const seed = (storage: MemoryStorage, refreshToken = 'REFRESH-1', clientId = 'test-client-id', scopes: string[] = []) =>
  storage.setItem(CREDENTIALS_KEY, JSON.stringify({ v: 1, clientId, refreshToken, scopes }))

/** Fake Spotify that rotates refresh tokens and invalidates the old one, like a strict server could. */
function rotatingServer() {
  let current = 'REFRESH-1'
  let counter = 1
  const seen: string[] = []
  const responder = async (request: RecordedRequest) => {
    if (!isToken(request)) return json({ id: 'u', display_name: 'U' })
    await tick() // a real network round trip, so concurrent callers genuinely overlap
    const used = request.body?.get('refresh_token') ?? ''
    seen.push(used)
    if (used !== current) return json({ error: 'invalid_grant', error_description: 'Refresh token revoked' }, 400)
    counter++
    current = `REFRESH-${counter}`
    return json(tokenBody({ access_token: `ACCESS-${counter}`, refresh_token: current }))
  }
  return { responder, seen, current: () => current }
}

describe('restoring a saved session', () => {
  it('shows "restoring" immediately, then signs in via a documented refresh grant', async () => {
    const local = new MemoryStorage()
    seed(local)
    const h = createHarness({ local, responder: (r) => (isToken(r) ? json(tokenBody({ access_token: 'ACCESS-R', refresh_token: undefined })) : json({ id: 'u', display_name: 'Ada' })) })
    assert.equal(h.session.getSnapshot().status, 'restoring')
    await h.session.initialize()
    assert.equal(h.session.getSnapshot().status, 'signed-in')
    const [request] = refreshes(h)
    assert.equal(request.body?.get('client_id'), 'test-client-id', 'PKCE refresh sends client_id')
    assert.equal(request.body?.get('refresh_token'), 'REFRESH-1')
    assert.equal(request.headers.authorization, undefined)
    assert.equal(JSON.parse(local.map.get(CREDENTIALS_KEY) as string).refreshToken, 'REFRESH-1', 'no new refresh token returned: keep the existing one')
  })

  it('stays signed out when nothing is saved', async () => {
    const h = createHarness()
    assert.equal(h.session.getSnapshot().status, 'signed-out')
    await h.session.initialize()
    assert.equal(h.session.getSnapshot().status, 'signed-out')
    assert.equal(h.requests.length, 0)
  })

  it('initialize is idempotent (StrictMode)', async () => {
    const local = new MemoryStorage()
    seed(local)
    const server = rotatingServer()
    const h = createHarness({ local, responder: server.responder })
    await Promise.all([h.session.initialize(), h.session.initialize()])
    assert.equal(refreshes(h).length, 1)
  })

  it('discards credentials issued to a different client ID, without any request', async () => {
    const local = new MemoryStorage()
    seed(local, 'OLD', 'some-other-client')
    const h = createHarness({ local })
    await h.session.initialize()
    assert.equal(h.requests.length, 0)
    assert.equal(local.map.size, 0)
    assert.equal(h.session.getSnapshot().status, 'signed-out')
  })

  it('discards corrupt storage instead of crashing', async () => {
    const local = new MemoryStorage()
    local.setItem(CREDENTIALS_KEY, '{not json')
    const h = createHarness({ local })
    await h.session.initialize()
    assert.equal(h.session.getSnapshot().status, 'signed-out')
    assert.equal(local.map.size, 0)
  })

  it('keeps the saved session when Spotify is unreachable, and offers a retry', async () => {
    const local = new MemoryStorage()
    seed(local)
    let online = false
    const h = createHarness({ local, responder: (r) => (online ? (isToken(r) ? json(tokenBody()) : json({ id: 'u' })) : Promise.reject(new TypeError('offline'))) })
    await h.session.initialize()
    let snap = h.session.getSnapshot()
    assert.equal(snap.status, 'signed-out')
    assert.equal(snap.error?.code, 'network')
    assert.equal(snap.hasStoredSession, true)
    online = true
    await h.session.retryRestore()
    snap = h.session.getSnapshot()
    assert.equal(snap.status, 'signed-in')
    assert.equal(snap.error, null)
  })

  it('clears a revoked or expired refresh token (invalid_grant) and says so, without retry loops', async () => {
    const local = new MemoryStorage()
    seed(local)
    const h = createHarness({ local, responder: () => json({ error: 'invalid_grant', error_description: 'Refresh token revoked' }, 400) })
    await h.session.initialize()
    const snap = h.session.getSnapshot()
    assert.equal(snap.status, 'signed-out')
    assert.equal(snap.error?.code, 'session-expired')
    assert.equal(snap.notice?.tone, 'warning')
    assert.equal(local.map.size, 0)
    assert.equal(refreshes(h).length, 1, 'no retry after invalid_grant')
  })

  it('keeps the token on an unknown rejection instead of destroying it', async () => {
    const local = new MemoryStorage()
    seed(local)
    const h = createHarness({ local, responder: () => json({ error: 'invalid_request' }, 400) })
    await h.session.initialize()
    assert.equal(h.session.getSnapshot().error?.code, 'exchange-failed')
    assert.equal(local.map.size, 1)
  })
})

describe('access token lifecycle', () => {
  const signedIn = async (server = rotatingServer()) => {
    const local = new MemoryStorage()
    seed(local)
    const h = createHarness({ local, responder: server.responder })
    await h.session.initialize()
    return { h, server, local }
  }

  it('reuses a fresh token without any request', async () => {
    const { h } = await signedIn()
    const before = h.requests.length
    assert.equal(await h.session.getAccessToken(), 'ACCESS-2')
    assert.equal(await h.session.getAccessToken(), 'ACCESS-2')
    assert.equal(h.requests.length, before)
  })

  it('refreshes when the token is about to expire, using expires_in from Spotify (no assumed lifetime)', async () => {
    const server = rotatingServer()
    const local = new MemoryStorage()
    seed(local)
    const h = createHarness({ local, responder: async (r) => (isToken(r) ? ((await server.responder(r)) as Response) : json({ id: 'u' })) })
    await h.session.initialize()
    h.clock.now += 3600 * 1000 - 61_000 // inside the lifetime, outside the margin
    assert.equal(await h.session.getAccessToken(), 'ACCESS-2')
    h.clock.now += 2_000 // now within the early-refresh margin
    assert.equal(await h.session.getAccessToken(), 'ACCESS-3')
  })

  it('short-lived tokens still refresh before expiry (margin is capped at half the lifetime)', async () => {
    let n = 0
    const local = new MemoryStorage()
    seed(local)
    const h = createHarness({ local, responder: (r) => (isToken(r) ? json(tokenBody({ access_token: `A${++n}`, expires_in: 30, refresh_token: undefined })) : json({ id: 'u' })) })
    await h.session.initialize()
    assert.equal(await h.session.getAccessToken(), 'A1')
    h.clock.now += 14_000
    assert.equal(await h.session.getAccessToken(), 'A1')
    h.clock.now += 2_000
    assert.equal(await h.session.getAccessToken(), 'A2')
  })

  it('collapses concurrent refreshes into one request', async () => {
    const { h } = await signedIn()
    h.clock.now += 3600 * 1000
    const before = refreshes(h).length
    const tokens = await Promise.all([h.session.getAccessToken(), h.session.getAccessToken(), h.session.getAccessToken(), h.session.getAccessToken()])
    assert.equal(new Set(tokens).size, 1)
    assert.equal(refreshes(h).length - before, 1)
  })

  it('persists a rotated refresh token and uses it next time', async () => {
    const { h, local, server } = await signedIn()
    assert.equal(JSON.parse(local.map.get(CREDENTIALS_KEY) as string).refreshToken, server.current())
    h.clock.now += 3600 * 1000
    await h.session.getAccessToken()
    assert.deepEqual(server.seen, ['REFRESH-1', 'REFRESH-2'])
    assert.equal(JSON.parse(local.map.get(CREDENTIALS_KEY) as string).refreshToken, 'REFRESH-3')
  })

  it('invalidateAccessToken (after a 401) forces a refresh', async () => {
    const { h } = await signedIn()
    h.session.invalidateAccessToken()
    assert.equal(await h.session.getAccessToken(), 'ACCESS-3')
  })

  it('expiry with a revoked refresh token signs out gracefully and rejects callers with a typed error', async () => {
    const server = rotatingServer()
    let revoked = false
    const local = new MemoryStorage()
    seed(local)
    const h = createHarness({ local, responder: (request) => (isToken(request) && revoked ? json({ error: 'invalid_grant' }, 400) : server.responder(request)) })
    await h.session.initialize()
    assert.equal(h.session.getSnapshot().status, 'signed-in')
    revoked = true // the user removed the app at spotify.com/account/apps
    h.clock.now += 3600 * 1000
    await assert.rejects(h.session.getAccessToken(), (error: unknown) => error instanceof AuthRequiredError && error.authError.code === 'session-expired')
    assert.equal(h.session.getSnapshot().status, 'signed-out')
    assert.equal(h.session.getSnapshot().profile, null)
    assert.equal(local.map.size, 0)
  })

  it('a transient failure while signed in keeps the session and reports a retryable error', async () => {
    const local = new MemoryStorage()
    seed(local)
    let fail = false
    const h = createHarness({ local, responder: (r) => (isToken(r) ? (fail ? new Response('bad gateway', { status: 502 }) : json(tokenBody())) : json({ id: 'u' })) })
    await h.session.initialize()
    fail = true
    h.clock.now += 3600 * 1000
    await assert.rejects(h.session.getAccessToken())
    assert.equal(h.session.getSnapshot().status, 'signed-in')
    assert.equal(h.session.getSnapshot().error?.code, 'network')
    assert.equal(local.map.size, 1)
    fail = false
    assert.equal(await h.session.getAccessToken(), 'ACCESS-1')
  })

  it('rejects when there is no session at all', async () => {
    const h = createHarness()
    await assert.rejects(h.session.getAccessToken(), AuthRequiredError)
  })
})

describe('two tabs sharing one refresh token', () => {
  it('serialize refreshes through the lock, so a rotated token is never reused and nobody is logged out', async () => {
    const server = rotatingServer()
    const local = new MemoryStorage()
    seed(local)
    const locks = createFakeLocks() // the one lock both tabs share
    const a = createHarness({ local, locks, responder: server.responder })
    const b = createHarness({ local, locks, responder: server.responder })
    await Promise.all([a.session.initialize(), b.session.initialize()])
    assert.equal(a.session.getSnapshot().status, 'signed-in')
    assert.equal(b.session.getSnapshot().status, 'signed-in')
    assert.deepEqual(server.seen, ['REFRESH-1', 'REFRESH-2'], 'second tab used the token the first one rotated to')

    a.clock.now += 3600 * 1000
    b.clock.now += 3600 * 1000
    await Promise.all([a.session.getAccessToken(), b.session.getAccessToken()])
    assert.equal(new Set(server.seen).size, server.seen.length, 'no refresh token was ever used twice')
    assert.equal(a.session.getSnapshot().status, 'signed-in')
    assert.equal(b.session.getSnapshot().status, 'signed-in')
  })

  it('a failure with a stale token does not delete a newer token another tab stored', async () => {
    const local = new MemoryStorage()
    seed(local, 'STALE')
    let first = true
    const h = createHarness({
      local,
      responder: async (request) => {
        if (!isToken(request)) return json({ id: 'u' })
        if (first) {
          first = false
          seed(local, 'NEWER') // another tab signs in while this request is in flight
          return json({ error: 'invalid_grant' }, 400)
        }
        return request.body?.get('refresh_token') === 'NEWER' ? json(tokenBody({ access_token: 'ACCESS-N', refresh_token: 'NEWER-2' })) : json({ error: 'invalid_grant' }, 400)
      },
    })
    await h.session.initialize()
    assert.equal(h.session.getSnapshot().status, 'signed-in')
    assert.equal(await h.session.getAccessToken(), 'ACCESS-N')
    assert.equal(JSON.parse(local.map.get(CREDENTIALS_KEY) as string).refreshToken, 'NEWER-2')
  })

  it('a slow refresh cannot overwrite a newer sign-in', async () => {
    const local = new MemoryStorage()
    seed(local, 'OLD')
    const h = createHarness({
      local,
      responder: async (request) => {
        if (!isToken(request)) return json({ id: 'u' })
        seed(local, 'BRAND-NEW') // user signed in again elsewhere while we were refreshing
        return json(tokenBody({ refresh_token: 'OLD-ROTATED' }))
      },
    })
    await h.session.initialize()
    assert.equal(JSON.parse(local.map.get(CREDENTIALS_KEY) as string).refreshToken, 'BRAND-NEW')
  })

  it('follows another tab signing out, and another tab signing in', async () => {
    const server = rotatingServer()
    const local = new MemoryStorage()
    seed(local)
    const h = createHarness({ local, responder: server.responder })
    await h.session.initialize()
    local.removeItem(CREDENTIALS_KEY)
    h.session.handleExternalStorageChange()
    assert.equal(h.session.getSnapshot().status, 'signed-out')
    assert.match(h.session.getSnapshot().notice?.message ?? '', /another tab/)

    seed(local, 'REFRESH-3')
    // fake server now expects REFRESH-3 to be current
    const h2 = createHarness({ local, responder: (r) => (isToken(r) ? json(tokenBody({ access_token: 'FROM-OTHER-TAB' })) : json({ id: 'u' })) })
    local.removeItem(CREDENTIALS_KEY)
    await h2.session.initialize()
    seed(local)
    h2.session.handleExternalStorageChange()
    await tick()
    await tick()
    assert.equal(h2.session.getSnapshot().status, 'signed-in')
  })
})

describe('logout', () => {
  it('clears memory, localStorage and the in-progress attempt, and resets everything the UI shows', async () => {
    const local = new MemoryStorage()
    seed(local)
    const server = rotatingServer()
    const h = createHarness({ local, responder: server.responder })
    await h.session.initialize()
    await tick()
    await tick()
    assert.equal(h.session.getSnapshot().profile?.displayName, 'U')
    h.session.logout()
    const snap = h.session.getSnapshot()
    assert.equal(snap.status, 'signed-out')
    assert.equal(snap.profile, null)
    assert.equal(snap.profileStatus, 'idle')
    assert.deepEqual([...snap.grantedScopes], [])
    assert.equal(snap.hasStoredSession, false)
    assert.equal(local.map.size, 0)
    assert.equal(h.tab.map.size, 0)
    await assert.rejects(h.session.getAccessToken(), AuthRequiredError)
  })

  it('a refresh that finishes after logout cannot bring the session back or re-save a token', async () => {
    const local = new MemoryStorage()
    seed(local)
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const h = createHarness({
      local,
      responder: async (request) => {
        if (!isToken(request)) return json({ id: 'u' })
        await gate
        return json(tokenBody({ access_token: 'LATE', refresh_token: 'LATE-REFRESH' }))
      },
    })
    const restoring = h.session.initialize()
    await tick()
    h.session.logout()
    release?.()
    await restoring
    await tick()
    assert.equal(h.session.getSnapshot().status, 'signed-out')
    assert.equal(local.map.size, 0, 'the late refresh token was not written back')
    await assert.rejects(h.session.getAccessToken())
  })

  it('logging out mid sign-in invalidates the pending exchange', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const h = createHarness({
      responder: async (request) => {
        if (isToken(request)) await gate
        return isToken(request) ? json(tokenBody()) : json({ id: 'u' })
      },
    })
    await h.session.login()
    const state = new URL(h.navigations[0]).searchParams.get('state')
    const pending = h.session.handleCallback(`?code=C&state=${state}`)
    await tick()
    h.session.logout()
    release?.()
    const result = await pending
    assert.equal(result.ok, false)
    assert.equal(h.session.getSnapshot().status, 'signed-out')
    assert.equal(h.local.map.size, 0)
  })
})

describe('profile access', () => {
  const signIn = async (apiResponse: (request: RecordedRequest) => Response) => {
    const h = createHarness({ responder: (r) => (isToken(r) ? json(tokenBody()) : apiResponse(r)) })
    await h.session.login()
    const state = new URL(h.navigations[0]).searchParams.get('state')
    await h.session.handleCallback(`?code=C&state=${state}`)
    await tick()
    await tick()
    return h
  }

  it('reports a 403 as a restriction, not as a fake connected account', async () => {
    const h = await signIn(() => json({ error: { status: 403, message: 'Check settings on developer.spotify.com/dashboard, the user may not be registered.' } }, 403))
    const snap = h.session.getSnapshot()
    assert.equal(snap.status, 'signed-in')
    assert.equal(snap.profileStatus, 'restricted')
    assert.equal(snap.profile, null)
    assert.match(snap.profileMessage ?? '', /development mode/)
  })

  it('reports rate limiting and server errors as retryable failures', async () => {
    const h = await signIn(() => new Response('', { status: 429, headers: { 'Retry-After': '3' } }))
    assert.equal(h.session.getSnapshot().profileStatus, 'error')
  })

  it('refreshes once and retries when the access token is rejected (401)', async () => {
    let calls = 0
    const h = await signIn(() => (++calls === 1 ? json({ error: 'expired' }, 401) : json({ id: 'u', display_name: 'Back again' })))
    assert.equal(h.session.getSnapshot().profile?.displayName, 'Back again')
    assert.equal(calls, 2)
  })

  it('keeps only expected fields and https URLs, and falls back to the ID when there is no display name', async () => {
    const h = await signIn(() => json({ id: 'user-9', display_name: null, email: 'secret@example.com', images: [{ url: 'http://insecure/x.png', width: 64 }, { url: 'https://i.scdn.co/a.jpg', width: 300 }], external_urls: { spotify: 'javascript:alert(1)' } }))
    const profile = h.session.getSnapshot().profile
    assert.equal(profile?.displayName, 'user-9')
    assert.equal(profile?.imageUrl, 'https://i.scdn.co/a.jpg')
    assert.equal(profile?.profileUrl, null)
    assert.equal(JSON.stringify(profile).includes('secret@example.com'), false)
  })
})

describe('leakage guards', () => {
  const authDir = new URL('../src/features/auth/', import.meta.url)
  const files = readdirSync(authDir).filter((name) => /\.(ts|tsx)$/.test(name))

  it('no auth source file logs anything', () => {
    for (const name of files) assert.doesNotMatch(readFileSync(new URL(name, authDir), 'utf8'), /\bconsole\./, name)
  })

  it('no source file mentions a client secret', () => {
    for (const name of files) assert.doesNotMatch(readFileSync(new URL(name, authDir), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /client_secret|CLIENT_SECRET/i, name)
  })

  it('a full sign-in, refresh and logout writes no secret to console output', async () => {
    const original = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug }
    const captured: string[] = []
    for (const key of Object.keys(original) as Array<keyof typeof original>) console[key] = (...args: unknown[]) => void captured.push(args.map(String).join(' '))
    try {
      const h = createHarness({ responder: (r) => (isToken(r) ? json(tokenBody({ access_token: 'SECRET-ACCESS', refresh_token: 'SECRET-REFRESH' })) : json({ id: 'u' })) })
      await h.session.login()
      const state = new URL(h.navigations[0]).searchParams.get('state')
      await h.session.handleCallback(`?code=SECRET-CODE&state=${state}`)
      h.clock.now += 3600 * 1000
      await h.session.getAccessToken().catch(() => undefined)
      h.session.logout()
    } finally {
      Object.assign(console, original)
    }
    assert.equal(captured.join('\n').match(/SECRET/g), null)
  })
})
