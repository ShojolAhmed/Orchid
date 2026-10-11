import { useId, type ReactNode } from 'react'
import styles from './Shelf.module.css'

interface ShelfProps {
  title: string
  /** Optional right-aligned link or button. */
  action?: ReactNode
  children: ReactNode
}

/** Titled section holding a responsive grid of cards. */
export function Shelf({ title, action, children }: ShelfProps) {
  const headingId = useId()
  return (
    <section className={styles.shelf} aria-labelledby={headingId}>
      <div className={styles.header}>
        <h2 id={headingId} className={styles.title}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function CardGrid({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <div className={styles.grid} aria-busy={busy || undefined}>
      {children}
    </div>
  )
}
