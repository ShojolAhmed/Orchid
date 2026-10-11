import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CREDENTIALS_KEY } from '../src/features/auth/storage.ts'
import { beginLogin, CONFIG, createHarness, json, tick, tokenBody, type RecordedRequest } from './helpers/auth-harness.ts'

const tokenRequests = (requests: RecordedRequest[]) => requests.filter((request) => request.url.endsWith('/api/token'))
const okResponder = (request: RecordedRequest) => (request.url.endsWith('/api/token') ? json(tokenBody()) : json({ id: 'user1', display_name: 'Ada' }))

describe('starting sign-in', () => {
  it('saves the PKCE attempt per tab and navigates to Spotify with the matching challenge', async () => {
    const h = createHarness({ responder: okResponder })
    const { url, state } = await beginLogin(h, '/library')
    assert.equal(h.session.getSnapshot().status, 'redirecting')
    assert.ok(state.length > 20)
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
    assert.equal(h.local.map.size, 0, 'nothing is written to localStorage before sign-in succeeds')
    assert.equal(h.tab.map.size, 1, 'the attempt lives in sessionStorage')
    assert.equal(h.tab.dump().includes(url.searchParams.get('code_challenge') ?? 'x'), false, 'the challenge is not the verifier')
  })

  it('refuses to start, without leaving the page, when configuration is wrong', async () => {
    const h = createHarness({ config: { ...CONFIG, clientId: '', redirectUri: 'http://localhost:5173/callback' } })
    await h.session.login()
    assert.equal(h.navigations.length, 0)
    assert.equal(h.session.getSnapshot().error?.code, 'not-configured')
    assert.equal(h.session.getSnapshot().status, 'signed-out')
  })

  it('refuses when the app is open at a different origin than the redirect URI', async () => {
    const h = createHarness({ origin: 'http://localhost:5173' })
    await h.session.login()
    assert.equal(h.navigations.length, 0)
    assert.equal(h.session.getSnapshot().error?.code, 'not-configured')
    assert.match(h.session.getSnapshot().error?.message ?? '', /redirect URI/)
  })

  it('ignores a second click while redirecting', async () => {
    const h = createHarness()
    await h.session.login()
    await h.session.login()
    assert.equal(h.navigations.length, 1)
  })
})

describe('callback: state validation (CSRF)', () => {
  it('rejects a mismatched state, never contacts the token endpoint, and burns the attempt', async () => {
    const h = createHarness({ responder: okResponder })
    await beginLogin(h)
    const result = await h.session.handleCallback('?code=C&state=forged')
    assert.equal(result.ok, false)
    assert.equal(!result.ok && result.error.code, 'callback-invalid')
    assert.equal(tokenRequests(h.requests).length, 0)
    assert.equal(h.tab.map.size, 0, 'the attempt cannot be reused')
    assert.equal(h.session.getSnapshot().status, 'signed-out')
  })

  it('rejects a callback with no state', async () => {
    const h = createHarness({ responder: okResponder })
    await beginLogin(h)
    const result = await h.session.handleCallback('?code=C')
    assert.equal(!result.ok && result.error.code, 'callback-invalid')
    assert.equal(tokenRequests(h.requests).length, 0)
  })

  it('rejects a callback when no sign-in was started in this tab', async () => {
    const h = createHarness({ responder: okResponder })
    const result = await h.session.handleCallback('?code=C&state=anything')
    assert.equal(!result.ok && result.error.code, 'callback-invalid')
    assert.equal(tokenRequests(h.requests).length, 0)
  })

  it('rejects an attempt that has expired', async () => {
    const h = createHarness({ responder: okResponder })
    const { state } = await beginLogin(h)
    h.clock.now += 11 * 60 * 1000
    const result = await h.session.handleCallback(`?code=C&state=${state}`)
    assert.equal(!result.ok && result.error.code, 'callback-invalid')
    assert.match(!result.ok ? result.error.message : '', /expired/)
    assert.equal(tokenRequests(h.requests).length, 0)
  })

  it('validates state even on error responses', async () => {
    const h = createHarness({ responder: okResponder })
    await beginLogin(h)
    const result = await h.session.handleCallback('?error=access_denied&state=forged')
    assert.equal(!result.ok && result.error.code, 'callback-invalid')
  })
})

describe('callback: errors from Spotify', () => {
  it('treats access_denied as a calm, retryable cancellation', async () => {
    const h = createHarness({ responder: okResponder })
    const { state } = await beginLogin(h, '/search?q=x')
    const result = await h.session.handleCallback(`?error=access_denied&state=${state}`)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.error.code, 'access-denied')
      assert.equal(result.error.retryable, true)
      assert.equal(result.returnTo, '/search?q=x')
    }
    assert.equal(h.session.getSnapshot().status, 'signed-out')
    assert.equal(h.local.map.size, 0)
  })

  it('reports other provider errors with only an allow-listed detail', async () => {
    const h = createHarness({ responder: okResponder })
    const { state } = await beginLogin(h)
    const result = await h.session.handleCallback(`?error=server_error&state=${state}`)
    assert.equal(!result.ok && result.error.code, 'provider-error')
    const h2 = createHarness({ responder: okResponder })
    const second = await beginLogin(h2)
    const hostile = await h2.session.handleCallback(`?error=${encodeURIComponent('<img src=x onerror=alert(1)>')}&state=${second.state}`)
    assert.equal(!hostile.ok && hostile.error.code, 'provider-error')
    assert.equal(!hostile.ok && hostile.error.detail, undefined)
    assert.doesNotMatch(!hostile.ok ? hostile.error.message : '', /</)
  })

  it('rejects a callback without a code', async () => {
    const h = createHarness({ responder: okResponder })
    const { state } = await beginLogin(h)
    const result = await h.session.handleCallback(`?state=${state}`)
    assert.equal(!result.ok && result.error.code, 'callback-invalid')
  })
})

describe('callback: code exchange', () => {
  it('sends the verifier, client ID and exact redirect URI, with no secret or Authorization header', async () => {
    const h = createHarness({ responder: okResponder })
    const { state } = await beginLogin(h)
    const verifier = JSON.parse(h.tab.map.values().next().value as string).verifier as string
    const result = await h.session.handleCallback(`?code=THE-CODE&state=${state}`)
    assert.equal(result.ok, true)
    const [request] = tokenRequests(h.requests)
    assert.equal(request.method, 'POST')
    assert.equal(request.headers['content-type'], 'application/x-www-form-urlencoded')
    assert.equal(request.headers.authorization, undefined)
    assert.equal(request.body?.get('grant_type'), 'authorization_code')
    assert.equal(request.body?.get('code'), 'THE-CODE')
    assert.equal(request.body?.get('client_id'), 'test-client-id')
    assert.equal(request.body?.get('redirect_uri'), 'http://127.0.0.1:5173/callback')
    assert.equal(request.body?.get('code_verifier'), verifier)
    assert.equal(request.body?.has('client_secret'), false)
  })

  it('keeps the access token in memory only and the refresh token in localStorage', async () => {
    const h = createHarness({ responder: okResponder })
    const { state } = await beginLogin(h, '/library')
    const result = await h.session.handleCallback(`?code=C&state=${state}`)
    assert.deepEqual(result, { ok: true, returnTo: '/library' })
    assert.equal(h.session.getSnapshot().status, 'signed-in')
    assert.equal(await h.session.getAccessToken(), 'ACCESS-1')
    const stored = h.local.dump() + h.tab.dump()
    assert.equal(stored.includes('ACCESS-1'), false, 'access token must never be persisted')
    assert.equal(JSON.parse(h.local.map.get(CREDENTIALS_KEY) as string).refreshToken, 'REFRESH-1')
    assert.equal(h.tab.map.size, 0, 'the PKCE attempt is gone after use')
  })

  it('loads the profile after signing in', async () => {
    const h = createHarness({ responder: okResponder })
    const { state } = await beginLogin(h)
    await h.session.handleCallback(`?code=C&state=${state}`)
    await tick()
    await tick()
    const snap = h.session.getSnapshot()
    assert.equal(snap.profileStatus, 'ready')
    assert.equal(snap.profile?.displayName, 'Ada')
    assert.equal(h.requests.at(-1)?.headers.authorization, 'Bearer ACCESS-1')
  })

  it('is one-time: a repeated callback with a new query cannot replay the code', async () => {
    const h = createHarness({ responder: okResponder })
    const { state } = await beginLogin(h)
    await h.session.handleCallback(`?code=C&state=${state}`)
    const replay = await h.session.handleCallback(`?code=C&state=${state}&again=1`)
    assert.equal(replay.ok, false)
    assert.equal(tokenRequests(h.requests).length, 1)
  })

  it('handles React StrictMode double invocation: same query string, one exchange, same result', async () => {
    const h = createHarness({ responder: okResponder })
    const { state } = await beginLogin(h)
    const search = `?code=C&state=${state}`
    const [a, b] = await Promise.all([h.session.handleCallback(search), h.session.handleCallback(search)])
    assert.deepEqual(a, b)
    assert.equal(a.ok, true)
    assert.equal(tokenRequests(h.requests).length, 1)
  })

  it('survives the provider restoring concurrently on the callback route (child effect runs first)', async () => {
    const h = createHarness({ responder: okResponder })
    const { state } = await beginLogin(h)
    const pending = h.session.handleCallback(`?code=C&state=${state}`)
    await h.session.initialize() // provider effect runs after the page's
    const result = await pending
    assert.equal(result.ok, true)
    assert.equal(h.session.getSnapshot().status, 'signed-in')
  })

  it('reports a rejected exchange (e.g. invalid_grant) without storing anything', async () => {
    const h = createHarness({ responder: (r) => (r.url.endsWith('/api/token') ? json({ error: 'invalid_grant', error_description: 'Invalid authorization code' }, 400) : json({})) })
    const { state } = await beginLogin(h)
    const result = await h.session.handleCallback(`?code=C&state=${state}`)
    assert.equal(!result.ok && result.error.code, 'exchange-failed')
    assert.equal(!result.ok && result.error.detail, 'invalid_grant')
    assert.equal(h.local.map.size, 0)
    assert.equal(h.session.getSnapshot().status, 'signed-out')
  })

  it('reports an unreachable token endpoint as retryable', async () => {
    const h = createHarness({
      responder: () => {
        throw new TypeError('fetch failed')
      },
    })
    const { state } = await beginLogin(h)
    const result = await h.session.handleCallback(`?code=C&state=${state}`)
    assert.equal(!result.ok && result.error.code, 'network')
    assert.equal(!result.ok && result.error.retryable, true)
  })

  it('rejects a malformed token response instead of inventing values', async () => {
    for (const bad of [{ token_type: 'Bearer', expires_in: 3600 }, tokenBody({ expires_in: undefined }), tokenBody({ expires_in: -5 }), tokenBody({ token_type: 'MAC' }), tokenBody({ refresh_token: 42 })]) {
      const h = createHarness({ responder: () => json(bad) })
      const { state } = await beginLogin(h)
      const result = await h.session.handleCallback(`?code=C&state=${state}`)
      assert.equal(!result.ok && result.error.code, 'exchange-failed', JSON.stringify(bad))
      assert.equal(h.local.map.size, 0)
    }
  })

  it('works when Spotify issues no refresh token: signed in for the access token lifetime, nothing persisted', async () => {
    const h = createHarness({ responder: (r) => (r.url.endsWith('/api/token') ? json(tokenBody({ refresh_token: undefined })) : json({ id: 'u' })) })
    const { state } = await beginLogin(h)
    assert.equal((await h.session.handleCallback(`?code=C&state=${state}`)).ok, true)
    assert.equal(h.local.map.size, 0)
    assert.equal(h.session.getSnapshot().hasStoredSession, false)
    assert.equal(await h.session.getAccessToken(), 'ACCESS-1')
    h.clock.now += 3600 * 1000
    await assert.rejects(h.session.getAccessToken())
    assert.equal(h.session.getSnapshot().status, 'signed-out')
    assert.equal(h.session.getSnapshot().error?.code, 'session-expired')
  })

  it('does not assume scopes: if Spotify omits them, scope checks fail closed', async () => {
    const h = createHarness({ requiredScopes: ['streaming'], responder: (r) => (r.url.endsWith('/api/token') ? json(tokenBody({ scope: undefined })) : json({ id: 'u' })) })
    const { state } = await beginLogin(h)
    await h.session.handleCallback(`?code=C&state=${state}`)
    assert.deepEqual([...h.session.getSnapshot().missingScopes], ['streaming'])
  })

  it('reports missing scopes when a newer feature needs more than the session was granted', async () => {
    const h = createHarness({ requiredScopes: ['streaming', 'user-read-private'], responder: (r) => (r.url.endsWith('/api/token') ? json(tokenBody({ scope: 'user-read-private' })) : json({ id: 'u' })) })
    const { state } = await beginLogin(h)
    await h.session.handleCallback(`?code=C&state=${state}`)
    assert.deepEqual([...h.session.getSnapshot().missingScopes], ['streaming'])
  })
})
