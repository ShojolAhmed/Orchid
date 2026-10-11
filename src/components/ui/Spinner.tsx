import { LoaderCircle } from 'lucide-react'
import styles from './Spinner.module.css'

/** Decorative progress indicator. Always pair it with visible or live-region text that says what is happening. */
export function Spinner({ size = 18 }: { size?: number }) {
  return <LoaderCircle size={size} className={styles.spinner} aria-hidden="true" />
}
