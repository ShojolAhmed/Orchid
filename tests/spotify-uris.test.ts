import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { contextAllowsOffset, idFromUri, isContextUri, isTrackUri, parseSpotifyInput, parseSpotifyUri } from '../src/features/player/spotify/uris.ts'

const ID = '4iV5W9uYEdYUVa79Axb7Rh'

describe('spotify uris', () => {
  it('accepts canonical URIs only', () => {
    assert.deepEqual(parseSpotifyUri(`spotify:track:${ID}`), { kind: 'track', id: ID, uri: `spotify:track:${ID}` })
    assert.equal(parseSpotifyUri(`spotify:local:a:b:${ID}`), null)
    assert.equal(parseSpotifyUri('spotify:track:short'), null)
    assert.equal(parseSpotifyUri(`spotify:user:x:collection`), null)
    assert.equal(parseSpotifyUri(`https://open.spotify.com/track/${ID}`), null)
  })
  it('turns share links into URIs, ignoring query strings and intl prefixes', () => {
    assert.equal(parseSpotifyInput(`https://open.spotify.com/track/${ID}?si=abc`)?.uri, `spotify:track:${ID}`)
    assert.equal(parseSpotifyInput(`https://open.spotify.com/intl-fr/album/${ID}`)?.uri, `spotify:album:${ID}`)
    assert.equal(parseSpotifyInput(`  spotify:playlist:${ID} `)?.kind, 'playlist')
  })
  it('rejects display URLs from other hosts, http, and nonsense', () => {
    assert.equal(parseSpotifyInput(`http://open.spotify.com/track/${ID}`), null)
    assert.equal(parseSpotifyInput(`https://evil.example/track/${ID}`), null)
    assert.equal(parseSpotifyInput(''), null)
    assert.equal(parseSpotifyInput('neon tides'), null)
    assert.equal(parseSpotifyInput('https://open.spotify.com/track'), null)
  })
  it('classifies track and context URIs', () => {
    assert.equal(isTrackUri(`spotify:track:${ID}`), true)
    assert.equal(isTrackUri(`spotify:album:${ID}`), false)
    assert.equal(isTrackUri(undefined), false)
    assert.equal(isContextUri(`spotify:artist:${ID}`), true)
    assert.equal(isContextUri(`spotify:track:${ID}`), false)
    assert.equal(contextAllowsOffset(`spotify:artist:${ID}`), false)
    assert.equal(contextAllowsOffset(`spotify:album:${ID}`), true)
    assert.equal(idFromUri(`spotify:artist:${ID}`), ID)
    assert.equal(idFromUri('nope'), '')
  })
})
