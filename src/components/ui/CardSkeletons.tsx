import { Skeleton } from './Skeleton'
import { CardGrid } from './Shelf'
import styles from './CardSkeletons.module.css'

/** Placeholder cards while a shelf loads. */
export function CardSkeletons({ count = 6, round = false }: { count?: number; round?: boolean }) {
  return (
    <CardGrid busy>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.card}>
          <Skeleton height="auto" radius={round ? '50%' : 'var(--radius-md)'} />
          <Skeleton height="1rem" width="70%" />
          <Skeleton height="0.75rem" width="45%" />
        </div>
      ))}
    </CardGrid>
  )
}
