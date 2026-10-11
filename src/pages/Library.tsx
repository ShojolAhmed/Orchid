import { Heart, Library as LibraryIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Artwork, Chip, EmptyState, LoadMore, Notice, PlayButton, Skeleton, TrackList, TrackListSkeleton, type ArtworkSource } from '../components/ui'
import { AccessGate, useFeatureAccess } from '../features/auth'
import { ApiErrorState, trackToRow, useFollowedArtists, useMyPlaylists, useSavedAlbums, useSavedTracks, type Album, type Artist, type GatedPaged, type Playlist, type Track } from '../features/catalog'
import { NewPlaylistForm, useRememberSaved, useTrackActions } from '../features/library'
import { usePlayCollection, useTrackPlayback } from '../features/player'
import { pluralize } from '../lib/format'
import { paths } from '../lib/paths'
import { usePageTitle } from '../lib/usePageTitle'
import styles from './Library.module.css'

type Filter = 'all' | 'playlists' | 'albums' | 'artists' | 'songs'
type Sort = 'recents' | 'alphabetical'

const filters: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'albums', label: 'Albums' },
  { id: 'artists', label: 'Artists' },
  { id: 'songs', label: 'Liked Songs' },
]

interface LibraryItem {
  key: string
  kind: 'playlist' | 'album' | 'artist'
  id: string
  title: string
  subtitle: string
  artwork: ArtworkSource
  to: string
}

export function Library() {
  usePageTitle('Your Library')
  const access = useFeatureAccess('library', 'playlists', 'following')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('recents')

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Your Library</h1>
      <AccessGate access={access} what="see your library">
        <LibraryBody filter={filter} sort={sort} onFilter={setFilter} onSort={setSort} />
      </AccessGate>
    </div>
  )
}

function LibraryBody({ filter, sort, onFilter, onSort }: { filter: Filter; sort: Sort; onFilter: (filter: Filter) => void; onSort: (sort: Sort) => void }) {
  const playlists = useMyPlaylists()
  const albums = useSavedAlbums()
  const artists = useFollowedArtists()
  const songs = useSavedTracks()

  return (
    <>
      <Notice title="Your Spotify library vs. the queue">
        Everything here lives in your Spotify account: saving a song or album, or adding to a playlist, changes Spotify itself. The queue in Orchid's player is different: it is temporary, belongs to the current playback session, and never
        changes your library.
      </Notice>

      <div className={styles.toolbar}>
        <div className={styles.chips} role="group" aria-label="Filter library">
          {filters.map((item) => (
            <Chip key={item.id} selected={filter === item.id} onClick={() => onFilter(item.id)}>
              {item.label}
            </Chip>
          ))}
        </div>
        {filter !== 'songs' ? (
          <label className={styles.sort}>
            <span className="visually-hidden">Sort by</span>
            <select value={sort} onChange={(event) => onSort(event.currentTarget.value as Sort)} className={styles.select}>
              <option value="recents">Spotify's order</option>
              <option value="alphabetical">Alphabetical</option>
            </select>
          </label>
        ) : null}
        {filter === 'all' || filter === 'playlists' ? <NewPlaylistForm onCreated={playlists.reload} /> : null}
      </div>

      {filter === 'songs' ? <LikedSongs songs={songs} /> : <LibraryList filter={filter} sort={sort} playlists={playlists} albums={albums} artists={artists} songs={songs} onFilter={onFilter} />}
    </>
  )
}

function LibraryList({
  filter,
  sort,
  playlists,
  albums,
  artists,
  songs,
  onFilter,
}: {
  filter: Filter
  sort: Sort
  playlists: GatedPaged<Playlist>
  albums: GatedPaged<Album>
  artists: GatedPaged<Artist>
  songs: GatedPaged<Track>
  onFilter: (filter: Filter) => void
}) {
  const sources = [
    { kind: 'playlists' as const, label: 'playlists', state: playlists },
    { kind: 'albums' as const, label: 'albums', state: albums },
    { kind: 'artists' as const, label: 'artists', state: artists },
  ].filter((source) => filter === 'all' || filter === source.kind)

  const items = useMemo(() => {
    const all: LibraryItem[] = [
      ...(filter === 'all' || filter === 'playlists' ? playlists.items.map((p): LibraryItem => ({ key: `playlist-${p.id}`, kind: 'playlist', id: p.id, title: p.title, subtitle: `Playlist · ${p.owner}`, artwork: p.artwork, to: paths.playlist(p.id) })) : []),
      ...(filter === 'all' || filter === 'albums' ? albums.items.map((a): LibraryItem => ({ key: `album-${a.id}`, kind: 'album', id: a.id, title: a.title, subtitle: `Album · ${a.artistName}`, artwork: a.artwork, to: paths.album(a.id) })) : []),
      ...(filter === 'all' || filter === 'artists' ? artists.items.map((a): LibraryItem => ({ key: `artist-${a.id}`, kind: 'artist', id: a.id, title: a.name, subtitle: 'Artist', artwork: a.artwork, to: paths.artist(a.id) })) : []),
    ]
    return sort === 'alphabetical' ? [...all].sort((a, b) => a.title.localeCompare(b.title)) : all
  }, [filter, sort, playlists.items, albums.items, artists.items])

  const loading = sources.some((source) => source.state.status === 'loading')
  const failed = sources.filter((source) => source.state.status === 'error')
  const showLiked = filter === 'all' || filter === 'playlists'

  if (loading && items.length === 0) return <LibrarySkeleton />

  return (
    <>
      {failed.map((source) => (
        <ApiErrorState key={source.kind} error={source.state.error as Error} title={`Couldn't load your ${source.label}`} onRetry={source.state.reload} />
      ))}
      {items.length === 0 && failed.length === 0 && !showLiked ? (
        <EmptyState icon={<LibraryIcon size={28} />} title="Nothing here yet" description="Nothing is saved in this part of your Spotify library yet." />
      ) : (
        <ul className={styles.list} aria-label="Library items">
          {showLiked ? (
            <li>
              <LikedRow count={songs.total} status={songs.status} onOpen={() => onFilter('songs')} />
            </li>
          ) : null}
          {items.map((item) => (
            <li key={item.key}>
              <ItemRow item={item} />
            </li>
          ))}
        </ul>
      )}
      {sources.map((source) =>
        source.state.hasMore ? <LoadMore key={source.kind} loading={source.state.loadingMore} error={source.state.moreError?.message ?? null} onClick={source.state.loadMore} label={`Show more ${source.label}`} /> : null,
      )}
    </>
  )
}

function LikedSongs({ songs }: { songs: GatedPaged<Track> }) {
  const playback = useTrackPlayback(songs.items, 'Liked Songs', 'liked')
  const renderActions = useTrackActions(songs.items)
  useRememberSaved(songs.items.flatMap((track) => (track.uri ? [track.uri] : [])))

  if (songs.status === 'error') return <ApiErrorState error={songs.error as Error} title="Couldn't load your liked songs" onRetry={songs.reload} />
  if (songs.status !== 'success') return <TrackListSkeleton showArtwork />
  if (songs.items.length === 0) return <EmptyState icon={<Heart size={28} />} title="No liked songs yet" description="Tap the heart on a song and it is saved to your Spotify library, then shows up here." />
  return (
    <>
      <TrackList label="Liked Songs" items={songs.items.map(trackToRow)} currentId={playback.currentId} isPlaying={playback.isPlaying} showArtwork onPlay={playback.play} onAddToQueue={playback.addToQueue} renderActions={renderActions} />
      {songs.hasMore ? <LoadMore loading={songs.loadingMore} error={songs.moreError?.message ?? null} onClick={songs.loadMore} label="Show more liked songs" /> : null}
      {songs.skipped > 0 ? <Notice>{pluralize(songs.skipped, 'saved item')} can't be shown (removed or unavailable songs).</Notice> : null}
    </>
  )
}

function ItemRow({ item }: { item: LibraryItem }) {
  const { play, isPlaying } = usePlayCollection()
  const playing = isPlaying(item.kind, item.id)
  return (
    <div className={styles.row}>
      <Link to={item.to} className={styles.rowLink}>
        <Artwork source={item.artwork} label={item.title} shape={item.kind === 'artist' ? 'circle' : 'square'} className={styles.rowArt} />
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{item.title}</span>
          <span className={styles.rowSub}>{item.subtitle}</span>
        </span>
      </Link>
      <PlayButton subject={item.title} playing={playing} onClick={() => void play(item.kind, item.id, item.title)} className={styles.rowPlay} />
    </div>
  )
}

function LikedRow({ count, status, onOpen }: { count: number | null; status: string; onOpen: () => void }) {
  const { play, isPlaying } = usePlayCollection()
  const sub = status === 'success' && count !== null ? `Your Spotify library · ${pluralize(count, 'song')}` : status === 'error' ? 'Your Spotify library' : 'Your Spotify library · loading…'
  return (
    <div className={styles.row}>
      <button type="button" className={styles.rowLink} onClick={onOpen}>
        <span className={styles.likedArt} aria-hidden="true">
          <Heart size={22} fill="currentColor" />
        </span>
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>Liked Songs</span>
          <span className={styles.rowSub}>{sub}</span>
        </span>
      </button>
      <PlayButton subject="Liked Songs" playing={isPlaying('liked', 'liked')} onClick={() => void play('liked', 'liked', 'Liked Songs')} className={styles.rowPlay} />
    </div>
  )
}

function LibrarySkeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-label="Loading">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className={styles.skeletonRow}>
          <Skeleton width="3.5rem" height="3.5rem" radius="var(--radius-md)" />
          <div className={styles.skeletonText}>
            <Skeleton width="40%" height="1rem" />
            <Skeleton width="22%" height="0.75rem" />
          </div>
        </div>
      ))}
    </div>
  )
}

