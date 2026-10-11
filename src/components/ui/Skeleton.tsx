import type { CSSProperties } from 'react'
import styles from './Skeleton.module.css'

interface SkeletonProps {
  width?: CSSProperties['width']
  height?: CSSProperties['height']
  radius?: CSSProperties['borderRadius']
}

/** Loading placeholder. Decorative, so hidden from assistive tech; pair with an aria-busy region. */
export function Skeleton({ width = '100%', height = '1rem', radius = 'var(--radius-sm)' }: SkeletonProps) {
  return <span className={styles.skeleton} style={{ width, height, borderRadius: radius }} aria-hidden="true" />
}
