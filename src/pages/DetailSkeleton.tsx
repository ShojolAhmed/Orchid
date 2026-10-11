import { Skeleton, TrackListSkeleton } from '../components/ui'
import styles from './DetailPage.module.css'

/** Loading placeholder shared by album, artist and playlist pages. */
export function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className={styles.skeletonHeader}>
        <div className={styles.skeletonArt}>
          <Skeleton height="100%" radius="var(--radius-md)" />
        </div>
        <div className={styles.skeletonText}>
          <Skeleton width="4rem" height="0.875rem" />
          <Skeleton width="60%" height="3rem" />
          <Skeleton width="35%" height="1rem" />
        </div>
      </div>
      <TrackListSkeleton count={5} />
    </div>
  )
}
