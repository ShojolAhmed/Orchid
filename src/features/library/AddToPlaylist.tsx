import { ListMusic } from 'lucide-react'
import { useState } from 'react'
import { PlaylistPicker, Popover } from '../../components/ui'
import { catalogService, playlistSubtitle, useMyPlaylists } from '../catalog'
import { useViewerId } from '../auth'

interface AddToPlaylistProps {
  trackUri: string
  trackTitle: string
}

/** Opens a small panel to add one track to a playlist the user owns or collaborates on, or to a new private one. */
export function AddToPlaylist({ trackUri, trackTitle }: AddToPlaylistProps) {
  return (
    <Popover label={`Add ${trackTitle} to a playlist`} icon={<ListMusic size={18} aria-hidden="true" />} align="end">
      <Picker trackUri={trackUri} trackTitle={trackTitle} />
    </Popover>
  )
}

/** Mounted only while the panel is open, so rows do not each load the user's playlists. */
function Picker({ trackUri, trackTitle }: AddToPlaylistProps) {
  const viewerId = useViewerId()
  const playlists = useMyPlaylists()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Spotify only lets an app change playlists the user owns or collaborates on.
  const writable = playlists.items.filter((playlist) => playlist.collaborative || viewerId === null || playlist.ownerId === viewerId)
  const status = playlists.status === 'error' ? 'error' : playlists.status === 'success' ? 'ready' : 'loading'
  const fail = (error: unknown) => setMessage(error instanceof Error ? error.message : 'That did not work. Try again.')

  return (
    <PlaylistPicker
      subject={trackTitle}
      status={status}
      playlists={writable.map((playlist) => ({ id: playlist.id, title: playlist.title, subtitle: playlist.trackCount === null ? playlistSubtitle(playlist) : `${playlist.trackCount} songs` }))}
      busyId={busyId}
      creating={creating}
      message={message}
      onRetry={playlists.reload}
      onPick={(playlistId) => {
        setBusyId(playlistId)
        setMessage(null)
        const title = writable.find((playlist) => playlist.id === playlistId)?.title ?? 'the playlist'
        catalogService.addTracksToPlaylist(playlistId, [trackUri]).then(
          () => setMessage(`Added to ${title}.`),
          fail,
        ).finally(() => setBusyId(null))
      }}
      onCreate={(name) => {
        setCreating(true)
        setMessage(null)
        catalogService
          .createPlaylist({ name })
          .then((created) => catalogService.addTracksToPlaylist(created.id, [trackUri]).then(() => setMessage(`Created “${created.title}” and added the song.`)))
          .catch(fail)
          .finally(() => {
            setCreating(false)
            playlists.reload()
          })
      }}
    />
  )
}
