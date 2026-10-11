import { Music } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Artwork, CardGrid, CardSkeletons, EmptyState, PlayButton, Shelf } from '../components/ui'
import { AccessGate, useFeatureAccess } from '../features/auth'
import { ApiErrorState, albumToCard, playlistToCard, useMyPlaylists, useNewReleases, useRecentlyPlayedAlbums, useSavedAlbums, useTopArtists, type Album, type Playlist } from '../features/catalog'
import { usePlayCollection } from '../features/player'
import type { Gated, GatedPaged } from '../features/catalog'
import { usePageTitle } from '../lib/usePageTitle'
import { AlbumCard, ArtistCard, PlaylistCard } from './cards'
import { SetupStatus } from './SetupStatus'
import styles from './Home.module.css'

function greeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function Home() {
  usePageTitle('Home')
  const access = useFeatureAccess('profile')

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{greeting()}</h1>
      <AccessGate access={access} what="see your music">
        <HomeShelves />
      </AccessGate>
      <WhatIsMissing />
      <SetupStatus />
    </div>
  )
}

/** Each shelf loads, fails and explains itself independently, so one refused endpoint never blanks the page. */
function HomeShelves() {
  const playlists = useMyPlaylists()
  const albums = useSavedAlbums()
  const recent = useRecentlyPlayedAlbums()
  const top = useTopArtists()
  const releases = useNewReleases()

  return (
    <>
      <FromLibrary playlists={playlists} albums={albums} />

      <ShelfState title="Recently played" state={recent} empty="Nothing here yet. Play something and it will appear, from your real Spotify history.">
        {(items: Album[]) => (
          <CardGrid>
            {items.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </CardGrid>
        )}
      </ShelfState>

      <ShelfState title="Your top artists" note="Spotify's own ranking of what you listened to most over roughly the last six months." state={top} empty="Spotify has no top artists for this account yet.">
        {(items) => (
          <CardGrid>
            {items.map((artist) => (
              <ArtistCard key={artist.id} artist={artist} />
            ))}
          </CardGrid>
        )}
      </ShelfState>

      <PagedShelf title="Your playlists" state={playlists} empty="You have no playlists yet." render={(item: Playlist) => <PlaylistCard key={item.id} playlist={item} />} />
      <PagedShelf title="Saved albums" state={albums} empty="You have not saved any albums yet." render={(item: Album) => <AlbumCard key={item.id} album={item} />} />

      <ShelfState title="New releases" note="Albums from roughly the last two weeks, found by a Spotify catalog search. The same for everyone, not personalised." state={releases} empty="Spotify returned no new releases right now." hideOnError>
        {(items: Album[]) => (
          <CardGrid>
            {items.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </CardGrid>
        )}
      </ShelfState>
    </>
  )
}

/** Quick tiles built only from the user's own playlists and saved albums. This is the library, not a recommendation. */
function FromLibrary({ playlists, albums }: { playlists: GatedPaged<Playlist>; albums: GatedPaged<Album> }) {
  const tiles = [
    ...playlists.items.slice(0, 3).map((playlist) => ({ kind: 'playlist' as const, ...playlistToCard(playlist) })),
    ...albums.items.slice(0, 3).map((album) => ({ kind: 'album' as const, ...albumToCard(album) })),
  ]
  if (tiles.length === 0) return null
  return (
    <section aria-label="From your library" className={styles.quick}>
      {tiles.map((tile) => (
        <QuickTile key={`${tile.kind}-${tile.id}`} kind={tile.kind} id={tile.id} to={tile.to} title={tile.title} artwork={tile.artwork} />
      ))}
    </section>
  )
}

function QuickTile({ kind, id, to, title, artwork }: { kind: 'album' | 'playlist'; id: string; to: string; title: string; artwork: ReturnType<typeof albumToCard>['artwork'] }) {
  const { play, isPlaying } = usePlayCollection()
  const playing = isPlaying(kind, id)
  return (
    <div className={styles.tile}>
      <Link to={to} className={styles.tileLink}>
        <Artwork source={artwork} label={title} className={styles.tileArt} />
        <span className={styles.tileTitle}>{title}</span>
      </Link>
      <PlayButton subject={title} playing={playing} onClick={() => void play(kind, id, title)} className={[styles.tilePlay, playing && styles.tilePlaying].filter(Boolean).join(' ')} />
    </div>
  )
}

interface ShelfStateProps<T> {
  title: string
  note?: string
  state: Gated<T[]>
  empty: string
  hideOnError?: boolean
  children: (items: T[]) => ReactNode
}

/** One shelf with its own loading, restricted, error and empty states. */
function ShelfState<T>({ title, note, state, empty, hideOnError, children }: ShelfStateProps<T>) {
  if (state.access.status === 'reconnect') return <Shelf title={title}><AccessGate access={state.access} what={`see ${title.toLowerCase()}`}><span /></AccessGate></Shelf>
  if (state.status === 'error' && !state.data) return hideOnError ? null : <Shelf title={title}><ApiErrorState error={state.error as Error} onRetry={state.reload} title={`Couldn't load ${title.toLowerCase()}`} /></Shelf>
  if (state.status !== 'success' || !state.data) return <Shelf title={title}><CardSkeletons count={6} /></Shelf>
  if (state.data.length === 0) return hideOnError ? null : <Shelf title={title}><EmptyState icon={<Music size={28} />} title="Nothing here yet" description={empty} /></Shelf>
  return (
    <Shelf title={title}>
      {note ? <p className={styles.note}>{note}</p> : null}
      {children(state.data)}
    </Shelf>
  )
}

function PagedShelf<T>({ title, state, empty, render }: { title: string; state: GatedPaged<T>; empty: string; render: (item: T) => ReactNode }) {
  if (state.access.status === 'reconnect') return <Shelf title={title}><AccessGate access={state.access} what={`see ${title.toLowerCase()}`}><span /></AccessGate></Shelf>
  if (state.status === 'error') return <Shelf title={title}><ApiErrorState error={state.error as Error} onRetry={state.reload} title={`Couldn't load ${title.toLowerCase()}`} /></Shelf>
  if (state.status !== 'success') return <Shelf title={title}><CardSkeletons count={6} /></Shelf>
  if (state.items.length === 0) return <Shelf title={title}><EmptyState icon={<Music size={28} />} title="Nothing here yet" description={empty} /></Shelf>
  return (
    <Shelf title={title}>
      <CardGrid>{state.items.slice(0, 12).map(render)}</CardGrid>
    </Shelf>
  )
}

/** Honest list of what Spotify no longer provides to apps like this one, instead of fake shelves. */
function WhatIsMissing() {
  return (
    <details className={styles.missing}>
      <summary>Why no “Made for you”, recommendations or popular charts?</summary>
      <p>
        Spotify withdrew these from its Web API for apps like Orchid: recommendations, featured and editorial playlists, and browse categories (November 2024), then new-releases listings, artist top tracks and batch lookups for
        development-mode apps (February 2026). Orchid will not invent substitutes, so those shelves are absent. Everything shown here is your real Spotify data or a plain catalog search.
      </p>
    </details>
  )
}

