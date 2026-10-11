import { useEffect, useRef } from 'react'
import { Play, X } from 'lucide-react'
import { Artwork, Button, IconButton, type ArtworkSource } from '../ui'
import { formatDuration } from '../../lib/format'
import styles from './QueuePanel.module.css'

export interface QueueItemView {
  id: string
  title: string
  artistName: string
  durationMs: number
  artwork: ArtworkSource
}

interface QueuePanelProps {
  open: boolean
  nowPlaying: QueueItemView | null
  /** Tracks the user added. */
  queued: QueueItemView[]
  /** Remaining tracks from the current album/playlist. */
  upNext: QueueItemView[]
  contextLabel: string | null
  onClose: () => void
  onClear: () => void
  onRemoveQueued: (index: number) => void
  onPlayQueued: (list: 'queue' | 'next', index: number) => void
}

const MAX_UP_NEXT = 30

/**
 * Queue sidebar. A third column on desktop; an overlay sheet with a scrim on
 * tablet and mobile (see CSS). Escape closes it, and focus moves in on open.
 */
export function QueuePanel({ open, nowPlaying, queued, upNext, contextLabel, onClose, onClear, onRemoveQueued, onPlayQueued }: QueuePanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      returnFocus.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <aside className={styles.panel} aria-label="Queue">
        <div className={styles.header}>
          <h2 className={styles.heading}>Queue</h2>
          <button ref={closeRef} type="button" className={styles.close} aria-label="Close queue" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <p className={styles.note}>Temporary. Queued songs live in this playback session and are not saved to your Spotify library.</p>

        <div className={styles.scroll}>
          <section aria-labelledby="queue-now">
            <h3 id="queue-now" className={styles.sub}>
              Now playing
            </h3>
            {nowPlaying ? <Row item={nowPlaying} current /> : <p className={styles.empty}>Nothing is playing.</p>}
          </section>

          <section aria-labelledby="queue-added">
            <div className={styles.subRow}>
              <h3 id="queue-added" className={styles.sub}>
                Next in queue
              </h3>
              {queued.length > 0 ? (
                <Button variant="ghost" onClick={onClear} className={styles.clear}>
                  Clear
                </Button>
              ) : null}
            </div>
            {queued.length === 0 ? (
              <p className={styles.empty}>Add songs with the queue button on any track.</p>
            ) : (
              <ul className={styles.list}>
                {queued.map((item, i) => (
                  <li key={`${item.id}-${i}`}>
                    <Row item={item} onPlay={() => onPlayQueued('queue', i)} onRemove={() => onRemoveQueued(i)} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {upNext.length > 0 ? (
            <section aria-labelledby="queue-next">
              <h3 id="queue-next" className={styles.sub}>
                {contextLabel ? `Next from ${contextLabel}` : 'Next up'}
              </h3>
              <ul className={styles.list}>
                {upNext.slice(0, MAX_UP_NEXT).map((item, i) => (
                  <li key={`${item.id}-${i}`}>
                    <Row item={item} onPlay={() => onPlayQueued('next', i)} />
                  </li>
                ))}
              </ul>
              {upNext.length > MAX_UP_NEXT ? <p className={styles.empty}>And {upNext.length - MAX_UP_NEXT} more.</p> : null}
            </section>
          ) : null}
        </div>
      </aside>
    </>
  )
}

function Row({ item, current = false, onPlay, onRemove }: { item: QueueItemView; current?: boolean; onPlay?: () => void; onRemove?: () => void }) {
  return (
    <div className={[styles.row, current && styles.current].filter(Boolean).join(' ')}>
      <Artwork source={item.artwork} label={item.title} className={styles.thumb} />
      <div className={styles.text}>
        <p className={styles.title}>{item.title}</p>
        <p className={styles.artist}>{item.artistName}</p>
      </div>
      {item.durationMs > 0 ? <span className={styles.time}>{formatDuration(item.durationMs)}</span> : null}
      {onPlay ? (
        <IconButton label={`Play ${item.title}`} onClick={onPlay} className={styles.action}>
          <Play size={16} fill="currentColor" />
        </IconButton>
      ) : null}
      {onRemove ? (
        <IconButton label={`Remove ${item.title} from queue`} onClick={onRemove} className={styles.action}>
          <X size={16} />
        </IconButton>
      ) : null}
    </div>
  )
}
