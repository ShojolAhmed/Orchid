import { ListMusic } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { DetailHeader, EmptyState, LoadMore, Notice, PlayButton, TrackList } from '../components/ui'
import { AccessGate } from '../features/auth'
import { ApiErrorState, NotFoundError, trackToRow, usePlaylist, usePlaylistMoreTracks, type PlaylistDetail } from '../features/catalog'
import { useTrackActions } from '../features/library'
import { usePlayCollection, useTrackPlayback } from '../features/player'
import { formatTotalLength, pluralize } from '../lib/format'
import { usePageTitle } from '../lib/usePageTitle'
import { DetailSkeleton } from './DetailSkeleton'
import { NotFound } from './NotFound'
import styles from './DetailPage.module.css'

export function Playlist() {
  const { id = '' } = useParams()
  const playlist = usePlaylist(id)
  usePageTitle(playlist.data?.playlist.title ?? 'Playlist')

  return (
    <AccessGate access={playlist.access} what="open this playlist">
      {playlist.status === 'error' ? (
        playlist.error instanceof NotFoundError ? <NotFound /> : <ApiErrorState error={playlist.error as Error} onRetry={playlist.reload} />
      ) : !playlist.data || playlist.data.playlist.id !== id ? (
        <DetailSkeleton />
      ) : (
        <PlaylistContent detail={playlist.data} />
      )}
    </AccessGate>
  )
}

function PlaylistContent({ detail }: { detail: PlaylistDetail }) {
  const { playlist, restriction } = detail
  const { play, isPlaying } = usePlayCollection()
  const more = usePlaylistMoreTracks(playlist.id, detail.tracks)
  const tracks = [...(detail.tracks?.items ?? []), ...more.tracks]
  const playback = useTrackPlayback(tracks, playlist.title, `playlist:${playlist.id}`, playlist.uri)
  const renderActions = useTrackActions(tracks)
  const total = tracks.reduce((sum, track) => sum + track.durationMs, 0)
  const count = playlist.trackCount ?? detail.tracks?.total ?? null
  const skipped = (detail.tracks?.skipped ?? 0)

  return (
    <div className={styles.page}>
      <DetailHeader
        kind="Playlist"
        title={playlist.title}
        artwork={playlist.artwork}
        description={playlist.description}
        meta={[playlist.owner, count === null ? '' : pluralize(count, 'song'), tracks.length > 0 && !more.hasMore ? formatTotalLength(total) : ''].filter(Boolean).join(' · ')}
      />
      <div className={styles.actions}>
        <PlayButton size="lg" subject={playlist.title} playing={isPlaying('playlist', playlist.id)} onClick={() => void play('playlist', playlist.id, playlist.title)} />
      </div>

      {restriction === 'tracks-not-shared' ? (
        <Notice title="Spotify doesn't share this playlist's track list">
          While an app is in development mode, Spotify only provides the tracks of playlists you own or collaborate on. You can still play this playlist; Spotify queues it for you.
        </Notice>
      ) : tracks.length === 0 ? (
        <EmptyState icon={<ListMusic size={28} />} title="No songs to show" description="This playlist is empty, or holds only items Orchid can't show." />
      ) : (
        <>
          <TrackList label={`Tracks in ${playlist.title}`} items={tracks.map(trackToRow)} currentId={playback.currentId} isPlaying={playback.isPlaying} showArtwork onPlay={playback.play} onAddToQueue={playback.addToQueue} renderActions={renderActions} />
          {more.hasMore ? <LoadMore loading={more.loading} error={more.error?.message ?? null} onClick={more.loadMore} label="Show more songs" /> : null}
        </>
      )}
      {skipped > 0 ? <Notice>{pluralize(skipped, 'item')} in this playlist can't be shown (podcast episodes, local files or removed songs).</Notice> : null}
    </div>
  )
}
