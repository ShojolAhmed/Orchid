import styles from './Toast.module.css'

interface ToastProps {
  message: string | null
}

/** Polite live region: always mounted so screen readers pick up each message. */
export function Toast({ message }: ToastProps) {
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {message ? <p className={styles.toast}>{message}</p> : null}
    </div>
  )
}
