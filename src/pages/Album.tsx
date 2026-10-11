import { Link, useParams } from 'react-router-dom'
import { CardGrid, DetailHeader, ErrorState, Notice, PlayButton, SaveButton, Shelf, TrackList } from '../components/ui'
import { AccessGate } from '../features/auth'
import { ApiErrorState, NotFoundError, catalogService, trackToRow, useAlbum, type AlbumDetail } from '../features/catalog'
import { useSavedActions, useTrackActions } from '../features/library'
import { usePlayCollection, useTrackPlayback } from '../features/player'
import { formatReleaseDate, formatTotalLength, pluralize } from '../lib/format'
import { paths } from '../lib/paths'
import { useResource } from '../lib/useResource'
import { usePageTitle } from '../lib/usePageTitle'
import { AlbumCard } from './cards'
import { DetailSkeleton } from './DetailSkeleton'
import { NotFound } from './NotFound'
import styles from './DetailPage.module.css'

export function Album() {
  const { id = '' } = useParams()
  const album = useAlbum(id)
  usePageTitle(album.data?.album.title ?? 'Album')

  return (
    <AccessGate access={album.access} what="open this album">
      {album.status === 'error' ? (
        album.error instanceof NotFoundError ? <NotFound /> : <ApiErrorState error={album.error as Error} onRetry={album.reload} />
      ) : !album.data || album.data.album.id !== id ? (
        <DetailSkeleton />
      ) : (
        <AlbumContent detail={album.data} />
      )}
    </AccessGate>
  )
}

function AlbumContent({ detail }: { detail: AlbumDetail }) {
  const { album, tracks, tracksComplete } = detail
  const { play, isPlaying } = usePlayCollection()
  const playback = useTrackPlayback(tracks, album.title, `album:${album.id}`, album.uri)
  const renderActions = useTrackActions(tracks)
  const saved = useSavedActions([album.uri])
  const total = tracks.reduce((sum, track) => sum + track.durationMs, 0)
  const released = formatReleaseDate(album.releaseDate)

  return (
    <div className={styles.page}>
      <DetailHeader
        kind={album.albumType === 'single' ? 'Single' : album.albumType === 'compilation' ? 'Compilation' : 'Album'}
        title={album.title}
        artwork={album.artwork}
        meta={
          <>
            {album.artistId ? (
              <Link to={paths.artist(album.artistId)} className={styles.metaLink}>
                <strong>{album.artistName}</strong>
              </Link>
            ) : (
              <strong>{album.artistName}</strong>
            )}
            {[released, tracks.length > 0 ? pluralize(album.totalTracks ?? tracks.length, 'song') + (tracksComplete ? `, ${formatTotalLength(total)}` : '') : '']
              .filter(Boolean)
              .map((part) => ` · ${part}`)
              .join('')}
          </>
        }
      />
      <div className={styles.actions}>
        <PlayButton size="lg" subject={album.title} playing={isPlaying('album', album.id)} onClick={() => void play('album', album.id, album.title)} />
        {saved.available ? <SaveButton subject={album.title} saved={saved.isSaved(album.uri)} busy={saved.isPending(album.uri)} onToggle={() => saved.toggleWithNotice(album.uri, album.title)} /> : null}
      </div>
      {tracks.length === 0 ? (
        <ErrorState title="No tracks to show" description="Spotify returned no playable tracks for this album." />
      ) : (
        <TrackList label={`Tracks in ${album.title}`} items={tracks.map(trackToRow)} currentId={playback.currentId} isPlaying={playback.isPlaying} showAlbum={false} onPlay={playback.play} onAddToQueue={playback.addToQueue} renderActions={renderActions} />
      )}
      {!tracksComplete ? <Notice>This album is very long, so Orchid loaded only its first {tracks.length} tracks. Use the play button to hear the whole album.</Notice> : null}
      {album.artistId ? <MoreByArtist artistId={album.artistId} artistName={album.artistName} currentId={album.id} /> : null}
    </div>
  )
}

function MoreByArtist({ artistId, artistName, currentId }: { artistId: string; artistName: string; currentId: string }) {
  const more = useResource((signal) => catalogService.getArtistAlbums(artistId, '0', { signal }), [artistId])
  const others = (more.data?.items ?? []).filter((other) => other.id !== currentId).slice(0, 12)
  if (others.length === 0) return null
  return (
    <div className={styles.section}>
      <Shelf title={`More by ${artistName}`}>
        <CardGrid>
          {others.map((other) => (
            <AlbumCard key={other.id} album={other} />
          ))}
        </CardGrid>
      </Shelf>
    </div>
  )
}
