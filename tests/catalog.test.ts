import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SpotifyApiError } from '../src/features/api/errors.ts'
import type { SpotifyEndpoints } from '../src/features/api/endpoints.ts'
import type { SpotifyAlbum, SpotifyTrack } from '../src/features/api/models.ts'
import { createCatalogService } from '../src/features/catalog/catalogService.ts'
import { mapAlbum, mapPlayHistory, mapPlaylist, mapPlaylistEntry, mapTrack, pickImageUrl, plainText } from '../src/features/catalog/mappers.ts'
import { NotFoundError } from '../src/features/catalog/types.ts'
import { formatReleaseDate } from '../src/lib/format.ts'

const id = (n: number) => String(n).padStart(22, 'a')
const img = (width: number) => ({ url: `https://i.scdn.co/image/${width}`, width, height: width })

const rawTrack = (n: number, over: Record<string, unknown> = {}): SpotifyTrack => ({
  type: 'track',
  id: id(n),
  uri: `spotify:track:${id(n)}`,
  name: `Song ${n}`,
  duration_ms: 180000 + n,
  track_number: n,
  explicit: n % 2 === 0,
  artists: [{ id: id(900 + n), name: `Artist ${n}` }, { id: id(950), name: 'Guest' }],
  album: { id: id(500), name: 'The Album', images: [img(640), img(300), img(64)], artists: [{ id: id(900), name: 'Album Artist' }], release_date: '2024-03-05', release_date_precision: 'day' },
  ...over,
}) as SpotifyTrack

const rawAlbum = (n: number, over: Record<string, unknown> = {}): SpotifyAlbum => ({ type: 'album', id: id(n), name: `Album ${n}`, album_type: 'album', total_tracks: 10, release_date: '2023', images: [img(300)], artists: [{ id: id(900), name: 'Album Artist' }], ...over }) as SpotifyAlbum

describe('mappers', () => {
  it('maps a full track, building URIs from ids and joining artists', () => {
    const track = mapTrack(rawTrack(1))
    assert.equal(track?.uri, `spotify:track:${id(1)}`)
    assert.equal(track?.artistName, 'Artist 1, Guest')
    assert.equal(track?.artistId, id(901))
    assert.equal(track?.albumId, id(500))
    assert.equal(track?.artwork.imageUrl, 'https://i.scdn.co/image/300')
    assert.equal(track?.explicit, false)
  })

  it('skips everything that cannot be played: episodes, local files, deleted entries, bad ids, nameless items', () => {
    assert.equal(mapTrack(null), null)
    assert.equal(mapTrack({ type: 'episode', id: id(1), name: 'Pod' }), null)
    assert.equal(mapTrack(rawTrack(1, { is_local: true })), null)
    assert.equal(mapTrack(rawTrack(1, { id: null })), null)
    assert.equal(mapTrack(rawTrack(1, { id: 'short' })), null)
    assert.equal(mapTrack(rawTrack(1, { name: '  ' })), null)
  })

  it('tolerates missing artists, album and artwork instead of throwing', () => {
    const track = mapTrack({ id: id(2), name: 'Bare', type: 'track' })
    assert.equal(track?.artistName, 'Unknown artist')
    assert.equal(track?.artistId, '')
    assert.equal(track?.albumId, '')
    assert.equal(track?.artwork.imageUrl, undefined)
    assert.equal(typeof track?.artwork.seed, 'number')
  })

  it('uses the parent album for tracks listed inside an album (no album object)', () => {
    const track = mapTrack(rawTrack(3, { album: undefined }), { id: id(500), title: 'The Album', artwork: { seed: 7, imageUrl: 'https://i.scdn.co/x' } })
    assert.equal(track?.albumId, id(500))
    assert.equal(track?.albumTitle, 'The Album')
    assert.equal(track?.artwork.imageUrl, 'https://i.scdn.co/x')
  })

  it('picks the smallest image that is big enough, else the largest, and ignores non-https', () => {
    assert.equal(pickImageUrl([img(640), img(300), img(64)]), 'https://i.scdn.co/image/300')
    assert.equal(pickImageUrl([img(64), img(160)]), 'https://i.scdn.co/image/160')
    assert.equal(pickImageUrl([{ url: 'http://evil/x', width: 300 }, { url: null }]), undefined)
    assert.equal(pickImageUrl([{ url: 'https://i.scdn.co/nowidth' }]), 'https://i.scdn.co/nowidth')
    assert.equal(pickImageUrl(null), undefined)
  })

  it('maps albums with partial release dates and unknown type', () => {
    const album = mapAlbum(rawAlbum(1, { release_date: '1999-07', album_type: 'weird' }))
    assert.equal(album?.year, 1999)
    assert.equal(album?.albumType, 'unknown')
    assert.equal(mapAlbum(rawAlbum(1, { release_date: undefined }))?.year, null)
    assert.equal(mapAlbum(rawAlbum(1, { artists: [] }))?.artistName, 'Unknown artist')
  })

  it('maps playlists: owner fallback, count from `items` or the pre-February `tracks`, HTML stripped from the description', () => {
    const playlist = mapPlaylist({ id: id(7), name: 'Mix', description: 'Best &amp; <a href="x">brightest</a> &#x27;hits&#x27;', owner: { id: 'u1', display_name: null }, items: { total: 12 }, collaborative: true, public: null })
    assert.equal(playlist?.description, "Best & brightest 'hits'")
    assert.equal(playlist?.owner, 'u1')
    assert.equal(playlist?.trackCount, 12)
    assert.equal(playlist?.isPublic, null)
    assert.equal(mapPlaylist({ id: id(7), name: 'Old', tracks: { total: 3 } })?.trackCount, 3)
    assert.equal(plainText('&amp;lt;b&amp;gt;'), '&lt;b&gt;')
  })

  it('reads playlist entries from the renamed `item` field and falls back to `track`', () => {
    assert.equal(mapPlaylistEntry({ item: rawTrack(1) })?.id, id(1))
    assert.equal(mapPlaylistEntry({ track: rawTrack(2) })?.id, id(2))
    assert.equal(mapPlaylistEntry({ item: { type: 'episode', id: id(3) } }), null)
    assert.equal(mapPlaylistEntry({ item: null }), null)
  })

  it('builds recent history newest-first without repeats', () => {
    const tracks = mapPlayHistory({ items: [{ track: rawTrack(1) }, { track: rawTrack(2) }, { track: rawTrack(1) }, null, { track: null }] })
    assert.deepEqual(tracks.map((t) => t.id), [id(1), id(2)])
  })

  it('formats release dates only to the precision Spotify gave', () => {
    assert.equal(formatReleaseDate('2024'), '2024')
    assert.equal(formatReleaseDate('2024-03'), 'March 2024')
    assert.equal(formatReleaseDate('2024-03-05'), 'March 5, 2024')
    assert.equal(formatReleaseDate(null), '')
    assert.equal(formatReleaseDate('garbage'), '')
  })
})

type Partial_ = Partial<Record<keyof SpotifyEndpoints, (...args: never[]) => unknown>>
function service(api: Partial_) {
  return createCatalogService(() => api as unknown as SpotifyEndpoints)
}
const page = (items: unknown[], over: Record<string, unknown> = {}) => ({ items, total: items.length, offset: 0, limit: 10, next: null, ...over })

describe('catalog service: search', () => {
  it('makes one request for all four kinds with limit 10, mapping and counting skips', async () => {
    const calls: unknown[][] = []
    const svc = service({
      search: ((...args: unknown[]) => {
        calls.push(args)
        return Promise.resolve({
          tracks: page([rawTrack(1), null, { type: 'track', id: null }], { next: 'x' }),
          albums: page([rawAlbum(1)]),
          artists: page([{ id: id(5), name: 'A', images: [], genres: [] }]),
          playlists: page([null, { id: id(6), name: 'P' }]),
        })
      }) as never,
    })
    const results = await svc.search('  daft punk ')
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0]?.slice(0, 2), ['daft punk', ['track', 'album', 'artist', 'playlist']])
    assert.equal(results.query, 'daft punk')
    assert.equal(results.tracks.items.length, 1)
    assert.equal(results.tracks.skipped, 2)
    assert.equal(results.playlists.items.length, 1)
    assert.equal(results.playlists.skipped, 1)
  })

  it('offers "more" only when a full page came back, and stops inside Spotify\'s 1,000 window', async () => {
    const full = Array.from({ length: 10 }, (_, i) => rawTrack(i + 1))
    const svc = service({ search: (() => Promise.resolve({ tracks: page(full, { next: 'x' }) })) as never })
    assert.equal((await svc.search('a')).tracks.next, '10')
    assert.equal((await svc.searchMore('a', 'tracks', '10')).next, '20')
    assert.equal((await svc.searchMore('a', 'tracks', '980')).next, '990', 'offset 990 + limit 10 = 1000 is the last valid page')
    assert.equal((await svc.searchMore('a', 'tracks', '990')).next, null)
    const short = service({ search: (() => Promise.resolve({ tracks: page([rawTrack(1)]) })) as never })
    assert.equal((await short.search('a')).tracks.next, null)
  })
})

describe('catalog service: albums, artists, playlists', () => {
  it('follows album track pages and reports completeness', async () => {
    const offsets: number[] = []
    const first = page(Array.from({ length: 50 }, (_, i) => rawTrack(i + 1, { album: undefined })), { limit: 50, next: 'x' })
    const second = page([rawTrack(51, { album: undefined })], { limit: 50, offset: 50 })
    const svc = service({
      getAlbum: (() => Promise.resolve({ ...rawAlbum(500), tracks: first })) as never,
      getAlbumTracks: ((_id: string, offset: number) => {
        offsets.push(offset)
        return Promise.resolve(second)
      }) as never,
    })
    const detail = await svc.getAlbum(id(500))
    assert.equal(detail.tracks.length, 51)
    assert.deepEqual(offsets, [50])
    assert.equal(detail.tracksComplete, true)
    assert.equal(detail.tracks[0]?.albumTitle, 'Album 500')
  })

  it('turns 404/400 and malformed ids into NotFoundError without a request', async () => {
    let requests = 0
    const svc = service({
      getAlbum: (() => {
        requests += 1
        return Promise.reject(new SpotifyApiError('not-found', 404))
      }) as never,
    })
    await assert.rejects(svc.getAlbum('bad id!'), NotFoundError)
    assert.equal(requests, 0)
    await assert.rejects(svc.getAlbum(id(1)), NotFoundError)
  })

  it('lets other errors through unchanged', async () => {
    const svc = service({ getAlbum: (() => Promise.reject(new SpotifyApiError('rate-limited', 429, null, 9))) as never })
    await assert.rejects(svc.getAlbum(id(1)), (error: unknown) => error instanceof SpotifyApiError && error.kind === 'rate-limited')
  })

  it('dedupes repeated releases in a discography', async () => {
    const svc = service({
      getArtist: (() => Promise.resolve({ id: id(900), name: 'Album Artist', images: [] })) as never,
      getArtistAlbums: (() => Promise.resolve(page([rawAlbum(1), rawAlbum(2, { name: 'Album 1', id: id(2) }), rawAlbum(3)]))) as never,
    })
    const detail = await svc.getArtist(id(900))
    assert.equal(detail.albums.items.length, 2)
  })

  it('uses embedded playlist items when Spotify sends them, with no extra request', async () => {
    let itemCalls = 0
    const svc = service({
      getPlaylist: (() => Promise.resolve({ id: id(8), name: 'Mine', owner: { id: 'me' }, items: page([{ item: rawTrack(1) }, { item: { type: 'episode', id: id(2) } }], { limit: 100, next: 'x' }) })) as never,
      getPlaylistItems: (() => {
        itemCalls += 1
        return Promise.resolve(page([]))
      }) as never,
    })
    const detail = await svc.getPlaylist(id(8), 'me')
    assert.equal(detail.tracks?.items.length, 1)
    assert.equal(detail.tracks?.skipped, 1)
    assert.equal(detail.tracks?.next, '2')
    assert.equal(detail.restriction, null)
    assert.equal(itemCalls, 0)
  })

  it('says "not shared" for someone else\'s playlist without making a request that is certain to fail', async () => {
    let itemCalls = 0
    const svc = service({
      getPlaylist: (() => Promise.resolve({ id: id(8), name: 'Theirs', owner: { id: 'other' }, items: { total: 40 } })) as never,
      getPlaylistItems: (() => {
        itemCalls += 1
        return Promise.resolve(page([]))
      }) as never,
    })
    const detail = await svc.getPlaylist(id(8), 'me')
    assert.equal(detail.restriction, 'tracks-not-shared')
    assert.equal(detail.tracks, null)
    assert.equal(detail.playlist.trackCount, 40)
    assert.equal(itemCalls, 0)
  })

  it('fetches items for own or collaborative playlists that lack embedded items, and maps a 403 to "not shared"', async () => {
    const own = service({
      getPlaylist: (() => Promise.resolve({ id: id(8), name: 'Mine', owner: { id: 'me' } })) as never,
      getPlaylistItems: (() => Promise.resolve(page([{ item: rawTrack(1) }]))) as never,
    })
    assert.equal((await own.getPlaylist(id(8), 'me')).tracks?.items.length, 1)
    const refused = service({
      getPlaylist: (() => Promise.resolve({ id: id(8), name: 'Collab', owner: { id: 'other' }, collaborative: true })) as never,
      getPlaylistItems: (() => Promise.reject(new SpotifyApiError('forbidden', 403))) as never,
    })
    assert.equal((await refused.getPlaylist(id(8), 'me')).restriction, 'tracks-not-shared')
  })
})

describe('catalog service: library writes', () => {
  const trackUri = (n: number) => `spotify:track:${id(n)}`

  it('splits checks into groups of 40 and keeps answers in order', async () => {
    const sizes: number[] = []
    const svc = service({
      libraryContains: ((uris: string[]) => {
        sizes.push(uris.length)
        return Promise.resolve(uris.map((uri) => Number(uri.slice(-3)) % 2 === 0 || uri.endsWith(id(1))))
      }) as never,
    })
    const uris = Array.from({ length: 85 }, (_, i) => trackUri(i + 1))
    const answers = await svc.checkSaved(uris)
    assert.deepEqual(sizes, [40, 40, 5])
    assert.equal(answers.length, 85)
  })

  it('rejects a lookup whose answer count does not match (never guesses)', async () => {
    const svc = service({ libraryContains: (() => Promise.resolve([true])) as never })
    await assert.rejects(svc.checkSaved([trackUri(1), trackUri(2)]), (e: unknown) => e instanceof SpotifyApiError && e.kind === 'malformed')
  })

  it('only tracks and albums can be saved; artists, playlists, junk and empty lists are refused before any request', async () => {
    let calls = 0
    const svc = service({ librarySave: (() => ((calls += 1), Promise.resolve())) as never })
    for (const bad of [[`spotify:artist:${id(1)}`], [`spotify:playlist:${id(1)}`], ['spotify:track:short'], []]) {
      await assert.rejects(svc.setSaved(bad, true), (e: unknown) => e instanceof SpotifyApiError && e.kind === 'bad-request')
    }
    assert.equal(calls, 0)
    await svc.setSaved([`spotify:album:${id(1)}`], true)
    assert.equal(calls, 1)
  })

  it('removes with the delete endpoint and propagates failures instead of faking success', async () => {
    const seen: string[] = []
    const svc = service({
      libraryRemove: ((uris: string[]) => (seen.push(...uris), Promise.reject(new SpotifyApiError('forbidden', 403)))) as never,
    })
    await assert.rejects(svc.setSaved([trackUri(1)], false), (e: unknown) => e instanceof SpotifyApiError && e.kind === 'forbidden')
    assert.deepEqual(seen, [trackUri(1)])
  })

  it('creates private playlists by default and adds only track URIs, 100 per request', async () => {
    const created: unknown[][] = []
    const adds: number[] = []
    const svc = service({
      createPlaylist: ((...args: unknown[]) => (created.push(args), Promise.resolve({ id: id(9), name: 'New' }))) as never,
      addPlaylistItems: ((_id: string, uris: string[]) => (adds.push(uris.length), Promise.resolve({}))) as never,
    })
    const playlist = await svc.createPlaylist({ name: '  New  ' })
    assert.deepEqual(created[0], ['New', '', false])
    assert.equal(playlist.id, id(9))
    await svc.addTracksToPlaylist(id(9), Array.from({ length: 230 }, (_, i) => trackUri(i + 1)))
    assert.deepEqual(adds, [100, 100, 30])
    await assert.rejects(svc.addTracksToPlaylist(id(9), [`spotify:episode:${id(1)}`]), (e: unknown) => e instanceof SpotifyApiError)
    await assert.rejects(svc.createPlaylist({ name: '   ' }), (e: unknown) => e instanceof SpotifyApiError)
  })

  it('a create response that cannot be read is "malformed", not a pretend playlist', async () => {
    const svc = service({ createPlaylist: (() => Promise.resolve({})) as never })
    await assert.rejects(svc.createPlaylist({ name: 'x' }), (e: unknown) => e instanceof SpotifyApiError && e.kind === 'malformed')
  })
})
