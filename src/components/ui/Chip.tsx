import type { ButtonHTMLAttributes } from 'react'
import styles from './Chip.module.css'

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected: boolean
}

/** Toggle-style filter pill. Exposes its state via aria-pressed. */
export function Chip({ selected, className, children, type = 'button', ...rest }: ChipProps) {
  return (
    <button type={type} aria-pressed={selected} className={[styles.chip, selected && styles.selected, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </button>
  )
}
