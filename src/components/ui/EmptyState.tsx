import type { ReactNode } from 'react'
import styles from './EmptyState.module.css'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  children?: ReactNode
}

export function EmptyState({ icon, title, description, children }: EmptyStateProps) {
  return (
    <section className={styles.empty}>
      <div className={styles.icon} aria-hidden="true">
        {icon}
      </div>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description}>{description}</p>
      {children ? <div className={styles.actions}>{children}</div> : null}
    </section>
  )
}
