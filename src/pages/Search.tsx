import { Search as SearchIcon, SearchX, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CardGrid, Chip, EmptyState, LoadMore, Notice, Shelf, TrackList, TrackListSkeleton } from '../components/ui'
import { AccessGate, useFeatureAccess } from '../features/auth'
import { ApiErrorState, catalogService, trackToRow, useDebounced, useSearch, type Album, type Artist, type Page, type Playlist, type SearchKind, type SearchResults, type Track } from '../features/catalog'
import { useTrackActions } from '../features/library'
import { useTrackPlayback } from '../features/player'
import { hueFromString } from '../lib/hue'
import { paths } from '../lib/paths'
import { usePagedResource } from '../lib/useResource'
import { usePageTitle } from '../lib/usePageTitle'
import { AlbumCard, ArtistCard, PlaylistCard } from './cards'
import styles from './Search.module.css'

type Scope = 'all' | 'songs' | 'albums' | 'artists' | 'playlists'
const scopes: Array<{ id: Scope; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'songs', label: 'Songs' },
  { id: 'albums', label: 'Albums' },
  { id: 'artists', label: 'Artists' },
  { id: 'playlists', label: 'Playlists' },
]

/** Search shortcuts, not Spotify categories (that endpoint is gone for this app tier): each one just runs a search. */
const SUGGESTIONS = ['Pop', 'Hip-Hop', 'Rock', 'Electronic', 'Jazz', 'Classical', 'Indie', 'R&B', 'Latin', 'Ambient', 'Soul', 'Folk']

/** Wait this long after the last keystroke before asking Spotify. */
const SEARCH_DEBOUNCE_MS = 350

export function Search() {
  const [params, setParams] = useSearchParams()
  const urlQuery = params.get('q') ?? ''
  const [text, setText] = useState(urlQuery)
  const [scope, setScope] = useState<Scope>('all')
  const inputRef = useRef<HTMLInputElement>(null)
  const lastWritten = useRef(urlQuery)
  const access = useFeatureAccess('profile')

  // URL -> input (suggestion tiles, back/forward, clicking "Search" in the sidebar).
  useEffect(() => {
    if (urlQuery !== lastWritten.current) {
      lastWritten.current = urlQuery
      setText(urlQuery)
    }
  }, [urlQuery])

  // Input -> URL and request, debounced: one search per pause in typing, never one per character.
  const query = useDebounced(text.trim(), SEARCH_DEBOUNCE_MS)
  useEffect(() => {
    if (query !== lastWritten.current) {
      lastWritten.current = query
      setParams(query ? { q: query } : {}, { replace: true })
    }
  }, [query, setParams])

  // Focus the field on desktop only; on touch it would pop the keyboard.
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus()
  }, [])

  usePageTitle(query ? `Search: ${query}` : 'Search')
  const trimmed = text.trim()
  const browsing = trimmed === ''

  return (
    <div className={styles.page}>
      <h1 className="visually-hidden">Search</h1>
      <div className={styles.field}>
        <SearchIcon size={20} className={styles.fieldIcon} aria-hidden="true" />
        <label htmlFor="search-input" className="visually-hidden">
          What do you want to listen to?
        </label>
        <input
          id="search-input"
          ref={inputRef}
          type="search"
          className={styles.input}
          placeholder="What do you want to listen to?"
          autoComplete="off"
          spellCheck={false}
          maxLength={250}
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
        />
        {text ? (
          <button
            type="button"
            className={styles.clear}
            aria-label="Clear search"
            onClick={() => {
              setText('')
              inputRef.current?.focus()
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <AccessGate access={access} what="search Spotify">
        {browsing ? <Suggestions /> : <Results query={query} typing={trimmed !== query} scope={scope} onScope={setScope} />}
      </AccessGate>
    </div>
  )
}

function Suggestions() {
  return (
    <section aria-labelledby="try-heading" className={styles.browse}>
      <h2 id="try-heading" className={styles.heading}>
        Try searching for
      </h2>
      <ul className={styles.tiles}>
        {SUGGESTIONS.map((term) => {
          const hue = hueFromString(term)
          return (
            <li key={term}>
              <Link to={paths.searchFor(term)} className={styles.tile} style={{ background: `linear-gradient(145deg, hsl(${hue} 70% 42%), hsl(${(hue + 40) % 360} 75% 24%))` }}>
                <span className={styles.tileTitle}>{term}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Results({ query, typing, scope, onScope }: { query: string; typing: boolean; scope: Scope; onScope: (scope: Scope) => void }) {
  const search = useSearch(query)
  const results = search.data
  const settled = results !== undefined && results.query === query

  return (
    <>
      <div className={styles.chips} role="group" aria-label="Filter results">
        {scopes.map((item) => (
          <Chip key={item.id} selected={scope === item.id} onClick={() => onScope(item.id)}>
            {item.label}
          </Chip>
        ))}
      </div>

      {search.status === 'error' && !settled ? (
        <ApiErrorState error={search.error as Error} title="Search failed" onRetry={search.reload} />
      ) : !results ? (
        <>
          <p className="visually-hidden" role="status">
            Searching…
          </p>
          <TrackListSkeleton showArtwork count={6} />
        </>
      ) : (
        <ResultsBody results={results} scope={scope} busy={typing || search.status === 'loading' || !settled} />
      )}
    </>
  )
}

function ResultsBody({ results, scope, busy }: { results: SearchResults; scope: Scope; busy: boolean }) {
  const show = (s: Scope) => scope === 'all' || scope === s
  const counts = { songs: results.tracks.items.length, albums: results.albums.items.length, artists: results.artists.items.length, playlists: results.playlists.items.length }
  const visible = (['songs', 'albums', 'artists', 'playlists'] as const).filter((s) => show(s)).reduce((sum, s) => sum + counts[s], 0)

  return (
    <div className={styles.results} aria-busy={busy || undefined}>
      <p className="visually-hidden" role="status">
        {busy ? 'Searching…' : visible === 0 ? `No results for ${results.query}` : `Showing ${visible} results for ${results.query}`}
      </p>

      {visible === 0 && !busy ? (
        <EmptyState icon={<SearchX size={28} />} title={`No results for “${results.query}”`} description="Check the spelling, or try fewer words. Spotify returns at most 10 results of each kind per search." />
      ) : scope === 'all' ? (
        <>
          {counts.songs > 0 ? <SongsSection query={results.query} first={results.tracks} scoped={false} /> : null}
          {counts.albums > 0 ? (
            <Shelf title="Albums">
              <CardGrid>
                {results.albums.items.map((album) => (
                  <AlbumCard key={album.id} album={album} />
                ))}
              </CardGrid>
            </Shelf>
          ) : null}
          {counts.artists > 0 ? (
            <Shelf title="Artists">
              <CardGrid>
                {results.artists.items.map((artist) => (
                  <ArtistCard key={artist.id} artist={artist} />
                ))}
              </CardGrid>
            </Shelf>
          ) : null}
          {counts.playlists > 0 ? (
            <Shelf title="Playlists">
              <CardGrid>
                {results.playlists.items.map((playlist) => (
                  <PlaylistCard key={playlist.id} playlist={playlist} />
                ))}
              </CardGrid>
            </Shelf>
          ) : null}
          <Notice>Showing the top 10 of each kind. Pick a filter above to page through more.</Notice>
        </>
      ) : scope === 'songs' ? (
        <SongsSection query={results.query} first={results.tracks} scoped />
      ) : scope === 'albums' ? (
        <MoreSection title="Albums" kind="albums" query={results.query} first={results.albums} keyOf={(a: Album) => a.id} render={(items) => <CardGrid>{items.map((album) => <AlbumCard key={album.id} album={album} />)}</CardGrid>} />
      ) : scope === 'artists' ? (
        <MoreSection title="Artists" kind="artists" query={results.query} first={results.artists} keyOf={(a: Artist) => a.id} render={(items) => <CardGrid>{items.map((artist) => <ArtistCard key={artist.id} artist={artist} />)}</CardGrid>} />
      ) : (
        <MoreSection title="Playlists" kind="playlists" query={results.query} first={results.playlists} keyOf={(p: Playlist) => p.id} render={(items) => <CardGrid>{items.map((playlist) => <PlaylistCard key={playlist.id} playlist={playlist} />)}</CardGrid>} />
      )}
    </div>
  )
}

/** Songs: a track list with play, queue, save and add-to-playlist. Filtered view pages through more results. */
function SongsSection({ query, first, scoped }: { query: string; first: Page<Track>; scoped: boolean }) {
  const more = usePagedResource<Track>(
    (cursor, signal) => (cursor === null ? Promise.resolve(first) : catalogService.searchMore(query, 'tracks', cursor, { signal })),
    (track) => track.id,
    [query, scoped],
    scoped,
  )
  const tracks = scoped && more.status === 'success' ? more.items : first.items
  const playback = useTrackPlayback(tracks, 'Search results', `search:${query}`)
  const renderActions = useTrackActions(tracks)

  return (
    <section aria-labelledby="songs-heading">
      <h2 id="songs-heading" className={styles.heading}>
        Songs
      </h2>
      <TrackList label={`Songs matching ${query}`} items={tracks.map(trackToRow)} currentId={playback.currentId} isPlaying={playback.isPlaying} showArtwork onPlay={playback.play} onAddToQueue={playback.addToQueue} renderActions={renderActions} />
      {scoped && more.hasMore ? <LoadMore loading={more.loadingMore} error={more.moreError?.message ?? null} onClick={more.loadMore} /> : null}
    </section>
  )
}

function MoreSection<T>({ title, kind, query, first, keyOf, render }: { title: string; kind: SearchKind; query: string; first: Page<T>; keyOf: (item: T) => string; render: (items: T[]) => ReactNode }) {
  const more = usePagedResource<T>(
    (cursor, signal) => (cursor === null ? Promise.resolve(first) : (catalogService.searchMore(query, kind, cursor, { signal }) as unknown as Promise<Page<T>>)),
    keyOf,
    [query, kind],
    true,
  )
  const items = more.status === 'success' ? more.items : first.items
  return (
    <Shelf title={title}>
      {render(items)}
      {more.hasMore ? <LoadMore loading={more.loadingMore} error={more.moreError?.message ?? null} onClick={more.loadMore} /> : null}
    </Shelf>
  )
}
