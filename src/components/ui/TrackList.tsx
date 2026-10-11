import { ListPlus, Pause, Play } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatDuration, spokenDuration } from '../../lib/format'
import { Artwork, type ArtworkSource } from './Artwork'
import { Skeleton } from './Skeleton'
import styles from './TrackList.module.css'

export interface TrackRowData {
  id: string
  title: string
  /** Spotify URI when the row is a real track. Lets connected code attach save and playlist actions. */
  uri?: string
  artistName: string
  /** Absent when Spotify gave no artist id; the name is then plain text. */
  artistHref?: string
  albumTitle: string
  /** Absent when the track came without album info. */
  albumHref?: string
  durationMs: number
  /** True shows an "Explicit" marker. */
  explicit?: boolean
  artwork: ArtworkSource
}

interface TrackListProps {
  /** Accessible name for the list, e.g. "Tracks in Neon Tides". */
  label: string
  items: TrackRowData[]
  currentId: string | null
  isPlaying: boolean
  /** Show the cover thumbnail (search, library) instead of a plain track number. */
  showArtwork?: boolean
  showAlbum?: boolean
  onPlay: (index: number) => void
  onAddToQueue: (index: number) => void
  /** Extra per-row controls (save to library, add to playlist), supplied by connected code. */
  renderActions?: (track: TrackRowData, index: number) => ReactNode
}

export function TrackList({ label, items, currentId, isPlaying, showArtwork = false, showAlbum = true, onPlay, onAddToQueue, renderActions }: TrackListProps) {
  return (
    <ol className={[styles.list, showAlbum && styles.withAlbum].filter(Boolean).join(' ')} aria-label={label}>
      {items.map((track, index) => {
        const isCurrent = track.id === currentId
        const playing = isCurrent && isPlaying
        return (
          <li key={`${track.id}-${index}`} className={[styles.row, isCurrent && styles.current].filter(Boolean).join(' ')}>
            <button
              type="button"
              className={styles.play}
              aria-label={`${playing ? 'Pause' : 'Play'} ${track.title} by ${track.artistName}`}
              onClick={() => onPlay(index)}
            >
              {showArtwork ? (
                <Artwork source={track.artwork} label={track.title} className={styles.thumb} />
              ) : (
                <span className={styles.number} aria-hidden="true">
                  {playing ? <EqualizerBars /> : index + 1}
                </span>
              )}
              <span className={styles.overlay} aria-hidden="true">
                {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              </span>
            </button>

            <div className={styles.titleCell}>
              <p className={styles.title}>
                {track.title}
                {track.explicit ? (
                  <span className={styles.explicit} title="Explicit">
                    <span aria-hidden="true">E</span>
                    <span className="visually-hidden"> Explicit</span>
                  </span>
                ) : null}
              </p>
              {track.artistHref ? (
                <Link to={track.artistHref} className={styles.artist}>
                  {track.artistName}
                </Link>
              ) : (
                <span className={styles.artistPlain}>{track.artistName}</span>
              )}
            </div>

            {showAlbum ? (
              track.albumHref ? (
                <Link to={track.albumHref} className={styles.album}>
                  {track.albumTitle}
                </Link>
              ) : (
                <span className={styles.albumPlain}>{track.albumTitle}</span>
              )
            ) : null}

            <div className={styles.actions}>
              {renderActions ? <div className={styles.extras}>{renderActions(track, index)}</div> : null}
              <button type="button" className={styles.queue} aria-label={`Add ${track.title} to the temporary queue`} title="Add to queue (temporary, not saved to your library)" onClick={() => onAddToQueue(index)}>
                <ListPlus size={18} aria-hidden="true" />
              </button>
            </div>
            <span className={styles.duration}>
              <span aria-hidden="true">{formatDuration(track.durationMs)}</span>
              <span className="visually-hidden">{spokenDuration(track.durationMs)}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function EqualizerBars() {
  return (
    <span className={styles.bars}>
      <i />
      <i />
      <i />
    </span>
  )
}

export function TrackListSkeleton({ count = 6, showArtwork = false }: { count?: number; showArtwork?: boolean }) {
  return (
    <div className={styles.skeletonList} aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.skeletonRow}>
          <Skeleton width={showArtwork ? '2.5rem' : '1rem'} height={showArtwork ? '2.5rem' : '1rem'} />
          <div className={styles.skeletonText}>
            <Skeleton width="45%" height="1rem" />
            <Skeleton width="25%" height="0.75rem" />
          </div>
        </div>
      ))}
    </div>
  )
}
