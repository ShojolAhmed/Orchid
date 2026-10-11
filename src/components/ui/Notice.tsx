import { Info } from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './Notice.module.css'

interface NoticeProps {
  children: ReactNode
  /** Optional bold lead-in, e.g. "Why only this much?". */
  title?: string
  action?: ReactNode
}

/** A calm inline note for partial data: what is missing and why. Not an error. */
export function Notice({ title, children, action }: NoticeProps) {
  return (
    <aside className={styles.notice}>
      <Info size={18} className={styles.icon} aria-hidden="true" />
      <div className={styles.body}>
        {title ? <p className={styles.title}>{title}</p> : null}
        <p className={styles.text}>{children}</p>
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </aside>
  )
}
