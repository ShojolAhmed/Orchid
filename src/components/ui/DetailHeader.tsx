import type { CSSProperties, ReactNode } from 'react'
import { Artwork, type ArtworkSource } from './Artwork'
import styles from './DetailHeader.module.css'

interface DetailHeaderProps {
  /** "Album", "Playlist", "Artist". */
  kind: string
  title: string
  artwork: ArtworkSource
  shape?: 'square' | 'circle'
  /** Owner, year, track count, etc. */
  meta?: ReactNode
  description?: string
}

/** Large page header shared by album, artist and playlist pages. Contains the page's only h1. */
export function DetailHeader({ kind, title, artwork, shape = 'square', meta, description }: DetailHeaderProps) {
  return (
    <header className={styles.header} style={{ '--tint': `hsl(${artwork.seed} 55% 30%)` } as CSSProperties}>
      <div className={styles.art}>
        <Artwork source={artwork} label={title} shape={shape} className={styles.cover} />
      </div>
      <div className={styles.text}>
        <p className={styles.kind}>{kind}</p>
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
        {meta ? <p className={styles.meta}>{meta}</p> : null}
      </div>
    </header>
  )
}
