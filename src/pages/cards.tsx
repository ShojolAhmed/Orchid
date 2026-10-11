import { MediaCard } from '../components/ui'
import { albumToCard, artistToCard, playlistToCard, type Album, type Artist, type Playlist } from '../features/catalog'
import { usePlayCollection } from '../features/player'

/** Cards that know how to play their own collection from its Spotify URI. Used on every browse page. */

export function AlbumCard({ album }: { album: Album }) {
  const { play, isPlaying } = usePlayCollection()
  return <MediaCard {...albumToCard(album)} playing={isPlaying('album', album.id)} onPlay={() => void play('album', album.id, album.title)} />
}

export function PlaylistCard({ playlist }: { playlist: Playlist }) {
  const { play, isPlaying } = usePlayCollection()
  return <MediaCard {...playlistToCard(playlist)} playing={isPlaying('playlist', playlist.id)} onPlay={() => void play('playlist', playlist.id, playlist.title)} />
}

export function ArtistCard({ artist }: { artist: Artist }) {
  const { play, isPlaying } = usePlayCollection()
  return <MediaCard {...artistToCard(artist)} playing={isPlaying('artist', artist.id)} onPlay={() => void play('artist', artist.id, artist.name)} />
}
