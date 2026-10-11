import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getConfigIssues, sanitizeReturnTo } from '../src/features/auth/config.ts'
import { findMissingScopes, parseScopes, REQUIRED_SCOPES, scopesForFeatures } from '../src/features/auth/scopes.ts'

const codes = (clientId: string, redirectUri: string, origin?: string) => getConfigIssues({ clientId, redirectUri }, origin).map((issue) => issue.code)

describe('configuration checks', () => {
  it('accepts the documented local setup', () => {
    assert.deepEqual(codes('id', 'http://127.0.0.1:5173/callback', 'http://127.0.0.1:5173'), [])
  })
  it('accepts HTTPS and IPv6 loopback', () => {
    assert.deepEqual(codes('id', 'https://orchid.example.com/callback', 'https://orchid.example.com'), [])
    assert.deepEqual(codes('id', 'http://[::1]:5173/callback', 'http://[::1]:5173'), [])
  })
  it('reports missing values', () => {
    assert.deepEqual(codes('', ''), ['missing-client-id', 'missing-redirect-uri'])
  })
  it('rejects localhost, which Spotify no longer allows', () => {
    assert.ok(codes('id', 'http://localhost:5173/callback').includes('localhost-redirect-uri'))
  })
  it('rejects plain HTTP on non-loopback hosts', () => {
    assert.ok(codes('id', 'http://example.com/callback').includes('insecure-redirect-uri'))
  })
  it('rejects a path the router does not serve, and query strings', () => {
    assert.ok(codes('id', 'https://example.com/auth').includes('wrong-callback-path'))
    assert.ok(codes('id', 'https://example.com/callback?x=1').includes('invalid-redirect-uri'))
  })
  it('flags an app origin that differs from the redirect origin (sign-in could never finish)', () => {
    assert.ok(codes('id', 'http://127.0.0.1:5173/callback', 'http://localhost:5173').includes('origin-mismatch'))
  })
  it('rejects garbage', () => {
    assert.ok(codes('id', 'not a url').includes('invalid-redirect-uri'))
  })
})

describe('return-to sanitising', () => {
  it('keeps same-app paths, queries and hashes', () => {
    assert.equal(sanitizeReturnTo('/search?q=jazz#top'), '/search?q=jazz#top')
    assert.equal(sanitizeReturnTo('/album/abc'), '/album/abc')
  })
  it('refuses anything that could leave the app', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '', null, undefined, '/\nfoo']) {
      assert.equal(sanitizeReturnTo(bad as string | null | undefined), '/', String(bad))
    }
  })
  it('never returns to the callback route itself', () => {
    assert.equal(sanitizeReturnTo('/callback?code=x'), '/')
  })
})

describe('scopes', () => {
  it('requests nothing beyond what the implemented features need', () => {
    assert.deepEqual([...REQUIRED_SCOPES], [
      'playlist-modify-private',
      'playlist-modify-public',
      'playlist-read-collaborative',
      'playlist-read-private',
      'streaming',
      'user-follow-read',
      'user-library-modify',
      'user-library-read',
      'user-modify-playback-state',
      'user-read-email',
      'user-read-private',
      'user-read-recently-played',
      'user-top-read',
    ])
  })
  it('never requests a scope for follow-writes, listening history writes or account email beyond the playback set', () => {
    assert.ok(!REQUIRED_SCOPES.includes('user-follow-modify'))
    assert.ok(!REQUIRED_SCOPES.includes('user-read-playback-position'))
  })
  it('profile alone needs no scope, and playback scopes are de-duplicated and sorted', () => {
    assert.deepEqual(scopesForFeatures(['profile']), [])
    assert.deepEqual(scopesForFeatures(['profile', 'playback', 'playback']), ['streaming', 'user-modify-playback-state', 'user-read-email', 'user-read-private'])
  })
  it('parses and compares scope strings', () => {
    assert.deepEqual(parseScopes('b a  a'), ['a', 'b'])
    assert.deepEqual(parseScopes(undefined), [])
    assert.deepEqual(findMissingScopes(['streaming', 'x'], ['x']), ['streaming'])
  })
})
