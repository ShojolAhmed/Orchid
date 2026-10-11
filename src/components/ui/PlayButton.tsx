import { Pause, Play } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import styles from './PlayButton.module.css'

interface PlayButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** What this plays, e.g. "Neon Tides". The prefix "Play"/"Pause" is added. */
  subject: string
  playing?: boolean
  size?: 'md' | 'lg'
}

export function PlayButton({ subject, playing = false, size = 'md', className, type = 'button', ...rest }: PlayButtonProps) {
  const Icon = playing ? Pause : Play
  return (
    <button
      type={type}
      aria-label={`${playing ? 'Pause' : 'Play'} ${subject}`}
      className={[styles.button, styles[size], className].filter(Boolean).join(' ')}
      {...rest}
    >
      <Icon size={size === 'lg' ? 26 : 20} fill="currentColor" aria-hidden="true" />
    </button>
  )
}
