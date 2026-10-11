import type { CSSProperties } from 'react'
import styles from './Artwork.module.css'

/**
 * Where cover art comes from. Real Spotify data fills `imageUrl`; when an item has no image, a
 * gradient is derived from `seed` (a hue).
 */
export interface ArtworkSource {
  imageUrl?: string
  /** Hue 0-359 used to derive the placeholder gradient. */
  seed: number
}

interface ArtworkProps {
  source: ArtworkSource
  /** Used for the placeholder initial and, with an image, the alt text. */
  label: string
  shape?: 'square' | 'circle'
  /** Hide from assistive tech when a visible title sits right next to it. */
  decorative?: boolean
  className?: string
}


export function Artwork({ source, label, shape = 'square', decorative = true, className }: ArtworkProps) {
  const classes = [styles.art, shape === 'circle' && styles.circle, className].filter(Boolean).join(' ')
  if (source.imageUrl) {
    return (
      <img
        className={classes}
        src={source.imageUrl}
        alt={decorative ? '' : label}
        loading="lazy"
        draggable={false}
      />
    )
  }
  const style = {
    '--art-a': `hsl(${source.seed} 72% 52%)`,
    '--art-b': `hsl(${(source.seed + 48) % 360} 80% 26%)`,
  } as CSSProperties
  return (
    <div className={classes} style={style} role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : label} aria-hidden={decorative || undefined}>
      <span className={styles.glyph} aria-hidden="true">
        {label.trim().charAt(0).toUpperCase()}
      </span>
    </div>
  )
}
