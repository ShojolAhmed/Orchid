import { Button } from './Button'
import { Spinner } from './Spinner'
import styles from './LoadMore.module.css'

interface LoadMoreProps {
  loading: boolean
  /** A failed attempt. The list already on screen stays; this offers another try. */
  error?: string | null
  onClick: () => void
  label?: string
}

/** "Show more" control for paginated lists. */
export function LoadMore({ loading, error, onClick, label = 'Show more' }: LoadMoreProps) {
  return (
    <div className={styles.wrap}>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <Button variant="secondary" onClick={onClick} disabled={loading} aria-busy={loading || undefined} icon={loading ? <Spinner /> : undefined}>
        {loading ? 'Loading…' : error ? 'Try again' : label}
      </Button>
    </div>
  )
}
