import type { MediaCardData, TrackRowData } from '../../components/ui'
import { pluralize } from '../../lib/format'
import { paths } from '../../lib/paths'
import type { Album, Artist, Playlist, Track } from './types'

/** Maps domain objects onto the presentational shapes the UI components accept. */

export function trackToRow(track: Track): TrackRowData {
  return {
    id: track.id,
    ...(track.uri ? { uri: track.uri } : {}),
    title: track.title,
    artistName: track.artistName,
    ...(track.artistId ? { artistHref: paths.artist(track.artistId) } : {}),
    albumTitle: track.albumTitle,
    ...(track.albumId ? { albumHref: paths.album(track.albumId) } : {}),
    durationMs: track.durationMs,
    explicit: track.explicit === true,
    artwork: track.artwork,
  }
}

export function albumSubtitle(album: Album): string {
  return [album.year, album.artistName].filter((part) => part !== null && part !== '').join(' · ')
}

export function albumToCard(album: Album): MediaCardData {
  return { id: album.id, to: paths.album(album.id), title: album.title, subtitle: albumSubtitle(album), artwork: album.artwork }
}

export function playlistSubtitle(playlist: Playlist): string {
  return playlist.description || `By ${playlist.owner}`
}

export function playlistToCard(playlist: Playlist): MediaCardData {
  return { id: playlist.id, to: paths.playlist(playlist.id), title: playlist.title, subtitle: playlistSubtitle(playlist), artwork: playlist.artwork }
}

export function artistToCard(artist: Artist): MediaCardData {
  return { id: artist.id, to: paths.artist(artist.id), title: artist.name, subtitle: 'Artist', artwork: artist.artwork, shape: 'circle' }
}

export function trackCountLabel(count: number): string {
  return pluralize(count, 'song')
}
