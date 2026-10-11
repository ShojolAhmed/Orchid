import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './IconButton.module.css'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: icon-only controls need an accessible name. */
  label: string
  children: ReactNode
  active?: boolean
}

export function IconButton({ label, children, active = false, className, type = 'button', ...rest }: IconButtonProps) {
  const classes = [styles.iconButton, active && styles.active, className].filter(Boolean).join(' ')
  return (
    <button type={type} aria-label={label} title={label} className={classes} {...rest}>
      {children}
    </button>
  )
}
