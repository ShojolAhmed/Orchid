import { useCallback, useState } from 'react'
import { AppShell, Navigation, type ShortcutsView } from '../components/layout'
import { Toast } from '../components/ui'
import { paths } from '../lib/paths'
import { playlistSubtitle, useMyPlaylists } from '../features/catalog'
import { ConnectedAccountMenu, useAuthNotice } from '../features/auth'
import { ConnectedPlayerBar, ConnectedQueuePanel, PlayerProvider, usePlayer } from '../features/player'

/** Sidebar navigation with shortcuts to the user's own playlists. Empty (not invented) until Spotify is connected. */
function ConnectedNavigation() {
  const playlists = useMyPlaylists()
  const shortcuts: ShortcutsView = {
    status: playlists.status === 'error' ? 'error' : playlists.status === 'loading' ? 'loading' : 'ready',
    items: playlists.items.slice(0, 12).map((playlist) => ({
      id: playlist.id,
      to: paths.playlist(playlist.id),
      title: playlist.title,
      subtitle: playlist.trackCount === null ? playlistSubtitle(playlist) : `Playlist · ${playlist.owner}`,
      artwork: playlist.artwork,
    })),
    onRetry: playlists.reload,
  }
  return <Navigation shortcuts={shortcuts} />
}

function Shell() {
  const [queueOpen, setQueueOpen] = useState(false)
  const toggleQueue = useCallback(() => setQueueOpen((open) => !open), [])
  const { notice: playerNotice } = usePlayer()
  const authNotice = useAuthNotice()

  return (
    <>
      <AppShell
        navigation={<ConnectedNavigation />}
        account={<ConnectedAccountMenu />}
        player={<ConnectedPlayerBar queueOpen={queueOpen} onToggleQueue={toggleQueue} />}
        queuePanel={<ConnectedQueuePanel queueOpen={queueOpen} onToggleQueue={toggleQueue} />}
        queueOpen={queueOpen}
      />
      <Toast message={playerNotice ?? authNotice} />
    </>
  )
}

/**
 * App-layer composition: wires features into the layout slots. `PlayerProvider` picks the player
 * engine (real Spotify playback with a signed-in session, a silent simulation otherwise). It sits
 * above the routed pages, so navigating never recreates the player.
 */
export function Root() {
  return (
    <PlayerProvider initialTracks={[]}>
      <Shell />
    </PlayerProvider>
  )
}
