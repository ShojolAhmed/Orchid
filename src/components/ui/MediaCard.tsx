import { Link } from 'react-router-dom'
import { Artwork, type ArtworkSource } from './Artwork'
import { PlayButton } from './PlayButton'
import styles from './MediaCard.module.css'

export interface MediaCardData {
  id: string
  to: string
  title: string
  subtitle: string
  artwork: ArtworkSource
  shape?: 'square' | 'circle'
}

interface MediaCardProps extends MediaCardData {
  onPlay?: () => void
  playing?: boolean
}

/** Album, artist or playlist card. The play button is a sibling of the link, never nested in it. */
export function MediaCard({ to, title, subtitle, artwork, shape = 'square', onPlay, playing = false }: MediaCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.media}>
        <Link to={to} className={styles.artLink} tabIndex={-1} aria-hidden="true">
          <Artwork source={artwork} label={title} shape={shape} />
        </Link>
        {onPlay ? <PlayButton subject={title} playing={playing} onClick={onPlay} className={[styles.play, playing && styles.playing].filter(Boolean).join(' ')} /> : null}
      </div>
      <Link to={to} className={styles.text}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.subtitle}>{subtitle}</p>
      </Link>
    </article>
  )
}
