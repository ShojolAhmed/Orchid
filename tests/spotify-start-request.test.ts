import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildLinkRequest, buildStartRequest, MAX_URIS_PER_REQUEST } from '../src/features/player/spotify/startRequest.ts'
import { contextIdFromUri, toPlayerState, toPlaybackView, toTrack } from '../src/features/player/spotify/playbackMap.ts'
import type { SdkState } from '../src/features/player/spotify/sdkTypes.ts'

const id = (n: number) => String(n).padStart(22, 'a')
const track = (n: number, withUri = true) => ({
  id: `t${n}`, ...(withUri ? { uri: `spotify:track:${id(n)}` } : {}), title: `T${n}`, artistId: '', artistName: 'A', albumId: '', albumTitle: 'Al',
  trackNumber: 1, durationMs: 1000, artwork: { seed: 1 },
})
const opts = { label: 'L', contextId: 'ctx' }

describe('start request', () => {
  it('refuses sample tracks that have no Spotify URI', () => {
    assert.deepEqual(buildStartRequest([track(1, false)], opts), { ok: false, reason: 'sample' })
  })
  it('sends only valid track URIs, with the clicked track as the offset', () => {
    const r = buildStartRequest([track(1), track(2, false), track(3)], { ...opts, startIndex: 2 })
    assert.ok(r.ok)
    assert.deepEqual(r.request.body, { uris: [`spotify:track:${id(1)}`, `spotify:track:${id(3)}`], offset: { position: 1 } })
  })
  it('prefers an album context with a uri offset', () => {
    const ctx = `spotify:album:${id(9)}`
    const r = buildStartRequest([track(1)], { ...opts, contextUri: ctx })
    assert.ok(r.ok)
    assert.deepEqual(r.request.body, { context_uri: ctx, offset: { uri: `spotify:track:${id(1)}` } })
  })
  it('falls back to a track list for an artist context (no context offset allowed)', () => {
    const ctx = `spotify:artist:${id(9)}`
    const r = buildStartRequest([track(1)], { ...opts, contextUri: ctx })
    assert.ok(r.ok)
    assert.deepEqual(r.request.body, { uris: [`spotify:track:${id(1)}`], offset: { position: 0 } })
  })
  it('starts a context with no track URIs at all', () => {
    const ctx = `spotify:playlist:${id(9)}`
    const r = buildStartRequest([track(1, false)], { ...opts, contextUri: ctx })
    assert.ok(r.ok)
    assert.deepEqual(r.request.body, { context_uri: ctx })
  })
  it('caps the list and keeps the clicked track inside it', () => {
    const many = Array.from({ length: 250 }, (_, i) => track(i + 1))
    const r = buildStartRequest(many, { ...opts, startIndex: 150 })
    assert.ok(r.ok)
    const body = r.request.body
    assert.equal(body.uris?.length, MAX_URIS_PER_REQUEST)
    assert.deepEqual(body.offset, { position: 0 })
    assert.equal(body.uris?.[0], `spotify:track:${id(151)}`)
  })
  it('builds link requests and rejects podcasts and junk', () => {
    const t = buildLinkRequest(`https://open.spotify.com/track/${id(1)}?si=x`)
    assert.ok(t.ok)
    assert.deepEqual(t.request.body, { uris: [`spotify:track:${id(1)}`] })
    const a = buildLinkRequest(`spotify:album:${id(2)}`)
    assert.ok(a.ok)
    assert.equal(a.request.contextId, `album:${id(2)}`)
    assert.deepEqual(buildLinkRequest(`spotify:show:${id(3)}`), { ok: false, reason: 'not-music' })
    assert.deepEqual(buildLinkRequest('hello'), { ok: false, reason: 'unsupported-link' })
  })
})

const sdkState = (over: Partial<SdkState> = {}): SdkState => ({
  context: { uri: `spotify:album:${id(5)}`, metadata: { context_description: 'Neon' } },
  disallows: {}, paused: false, position: 1234.6, duration: 200000, repeat_mode: 2, shuffle: true,
  track_window: {
    current_track: { uri: `spotify:track:${id(1)}`, id: id(1), type: 'track', name: 'Song', album: { uri: `spotify:album:${id(5)}`, name: 'Al', images: [{ url: 'small', width: 64 }, { url: 'mid', width: 300 }] }, artists: [{ uri: `spotify:artist:${id(7)}`, name: 'X' }, { uri: `spotify:artist:${id(8)}`, name: 'Y' }] },
    previous_tracks: [], next_tracks: [],
  },
  ...over,
})

describe('state mapping', () => {
  it('maps SDK state without inventing anything', () => {
    const view = toPlaybackView(sdkState())
    assert.equal(view.isPlaying, true)
    assert.equal(view.positionMs, 1235)
    assert.equal(view.repeat, 'one')
    const t = toTrack(view.track, view.durationMs)
    assert.equal(t.artistName, 'X, Y')
    assert.equal(t.artistId, id(7))
    assert.equal(t.artwork.imageUrl, 'mid')
    assert.equal(t.durationMs, 200000)
  })
  it('labels the context from what we started, else Spotify metadata', () => {
    const view = toPlaybackView(sdkState())
    const ctx = `spotify:album:${id(5)}`
    assert.equal(toPlayerState(view, 0.5, false, { contextUri: ctx, contextId: 'album:mine', label: 'Mine' }).contextLabel, 'Mine')
    const other = toPlayerState(view, 0.5, false, null)
    assert.equal(other.contextLabel, 'Neon')
    assert.equal(other.contextId, `album:${id(5)}`)
    assert.equal(toPlayerState(null, 0.5, false, null).current, null)
    assert.equal(contextIdFromUri('spotify:user:me:collection'), 'liked')
  })
})
