import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { base64UrlEncode, createCodeChallenge, createCodeVerifier, createState, safeEqual } from '../src/features/auth/pkce.ts'
import { buildAuthorizeUrl } from '../src/features/auth/tokenClient.ts'
import { CONFIG } from './helpers/auth-harness.ts'

describe('PKCE helpers', () => {
  it('produces the RFC 7636 Appendix B challenge for the reference verifier', async () => {
    const challenge = await createCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
    assert.equal(challenge, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('creates verifiers of 43 to 128 unreserved characters that differ every time', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 50; i++) {
      const verifier = createCodeVerifier()
      assert.match(verifier, /^[A-Za-z0-9\-_]{43,128}$/)
      seen.add(verifier)
    }
    assert.equal(seen.size, 50)
  })

  it('creates unguessable URL-safe state values', () => {
    const a = createState()
    assert.match(a, /^[A-Za-z0-9\-_]{43}$/)
    assert.notEqual(a, createState())
  })

  it('base64url has no padding or unsafe characters', () => {
    assert.equal(base64UrlEncode(new Uint8Array([251, 255, 254])), '-__-')
  })

  it('compares strings by value', () => {
    assert.equal(safeEqual('abc', 'abc'), true)
    assert.equal(safeEqual('abc', 'abd'), false)
    assert.equal(safeEqual('abc', 'abcd'), false)
  })
})

describe('authorize URL', () => {
  it('carries every PKCE parameter, the exact redirect URI and no secret', () => {
    const url = new URL(buildAuthorizeUrl({ config: CONFIG, scopes: ['streaming', 'user-read-private'], state: 'S', challenge: 'C' }))
    assert.equal(url.origin + url.pathname, 'https://accounts.spotify.com/authorize')
    assert.equal(url.searchParams.get('response_type'), 'code')
    assert.equal(url.searchParams.get('client_id'), 'test-client-id')
    assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:5173/callback')
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
    assert.equal(url.searchParams.get('code_challenge'), 'C')
    assert.equal(url.searchParams.get('state'), 'S')
    assert.equal(url.searchParams.get('scope'), 'streaming user-read-private')
    assert.equal(url.searchParams.has('client_secret'), false)
    assert.equal(url.searchParams.has('code_verifier'), false)
  })

  it('omits scope when none are required', () => {
    const url = new URL(buildAuthorizeUrl({ config: CONFIG, scopes: [], state: 'S', challenge: 'C' }))
    assert.equal(url.searchParams.has('scope'), false)
  })
})
