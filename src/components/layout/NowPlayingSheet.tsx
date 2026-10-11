import { useEffect, useRef } from 'react'
import { ChevronDown, ListMusic } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Artwork, IconButton } from '../ui'
import { SeekBar } from './SeekBar'
import { TransportControls } from './TransportControls'
import { VolumeControl } from './VolumeControl'
import type { PlayerViewHandlers, PlayerViewState } from './playerView'
import styles from './NowPlayingSheet.module.css'

interface NowPlayingSheetProps {
  open: boolean
  state: PlayerViewState
  handlers: PlayerViewHandlers
  onClose: () => void
}

/** Full-screen player for small screens. A native modal <dialog> gives focus trapping and Escape for free. */
export function NowPlayingSheet({ open, state, handlers, onClose }: NowPlayingSheetProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const { track } = state

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog ref={ref} className={styles.sheet} aria-label="Now playing" onClose={onClose}>
      {track ? (
        <div className={styles.body}>
          <div className={styles.top}>
            <IconButton label="Close now playing" onClick={onClose}>
              <ChevronDown size={24} />
            </IconButton>
            <p className={styles.context}>{state.contextLabel ? `Playing from ${state.contextLabel}` : 'Now playing'}</p>
            <IconButton
              label="Show queue"
              onClick={() => {
                onClose()
                handlers.onToggleQueue()
              }}
            >
              <ListMusic size={20} />
            </IconButton>
          </div>
          <Artwork source={track.artwork} label={track.title} className={styles.art} />
          <div className={styles.meta}>
            <Link to={track.albumHref} className={styles.title} onClick={onClose}>
              {track.title}
            </Link>
            <Link to={track.artistHref} className={styles.artist} onClick={onClose}>
              {track.artistName}
            </Link>
          </div>
          <SeekBar positionMs={state.positionMs} durationMs={track.durationMs} onSeek={handlers.onSeek} />
          <TransportControls state={state} handlers={handlers} large />
          <VolumeControl volume={state.volume} muted={state.muted} onVolume={handlers.onVolume} onToggleMute={handlers.onToggleMute} />
          <p className={styles.note}>{state.engineNote}</p>
        </div>
      ) : null}
    </dialog>
  )
}
