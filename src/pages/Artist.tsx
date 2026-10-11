import { useParams } from 'react-router-dom'
import { CardGrid, DetailHeader, LoadMore, Notice, PlayButton, Shelf } from '../components/ui'
import { AccessGate } from '../features/auth'
import { ApiErrorState, NotFoundError, useArtist, useArtistAlbums, type Album, type ArtistDetail } from '../features/catalog'
import { usePlayCollection } from '../features/player'
import { usePageTitle } from '../lib/usePageTitle'
import { AlbumCard } from './cards'
import { DetailSkeleton } from './DetailSkeleton'
import { NotFound } from './NotFound'
import styles from './DetailPage.module.css'

export function Artist() {
  const { id = '' } = useParams()
  const artist = useArtist(id)
  usePageTitle(artist.data?.artist.name ?? 'Artist')

  return (
    <AccessGate access={artist.access} what="open this artist">
      {artist.status === 'error' ? (
        artist.error instanceof NotFoundError ? <NotFound /> : <ApiErrorState error={artist.error as Error} onRetry={artist.reload} />
      ) : !artist.data || artist.data.artist.id !== id ? (
        <DetailSkeleton />
      ) : (
        <ArtistContent detail={artist.data} />
      )}
    </AccessGate>
  )
}

function ArtistContent({ detail }: { detail: ArtistDetail }) {
  const { artist } = detail
  const { play, isPlaying } = usePlayCollection()
  const albums = useArtistAlbums(artist.id, detail.albums)
  const items = albums.status === 'success' ? albums.items : detail.albums.items

  const group = (type: Album['albumType'][]) => items.filter((album) => type.includes(album.albumType))
  const sections = [
    { title: 'Albums', items: group(['album']) },
    { title: 'Singles and EPs', items: group(['single']) },
    { title: 'Compilations', items: group(['compilation', 'unknown']) },
  ].filter((section) => section.items.length > 0)

  return (
    <div className={styles.page}>
      <DetailHeader kind="Artist" title={artist.name} artwork={artist.artwork} shape="circle" {...(artist.genres.length > 0 ? { meta: artist.genres.join(', ') } : {})} />
      <div className={styles.actions}>
        <PlayButton size="lg" subject={artist.name} playing={isPlaying('artist', artist.id)} onClick={() => void play('artist', artist.id, artist.name)} />
      </div>

      <Notice title="What Spotify shares about artists">
        Spotify no longer gives apps like Orchid an artist's top tracks, follower count or listener numbers, so none are shown. Play starts Spotify's own artist playlist; the discography below is the full catalog list.
      </Notice>

      {sections.length === 0 ? (
        <Notice>Spotify lists no albums for this artist.</Notice>
      ) : (
        sections.map((section) => (
          <div key={section.title} className={styles.section}>
            <Shelf title={section.title}>
              <CardGrid>
                {section.items.map((album) => (
                  <AlbumCard key={album.id} album={album} />
                ))}
              </CardGrid>
            </Shelf>
          </div>
        ))
      )}
      {albums.hasMore ? <LoadMore loading={albums.loadingMore} error={albums.moreError?.message ?? null} onClick={albums.loadMore} label="Show more releases" /> : null}
    </div>
  )
}
