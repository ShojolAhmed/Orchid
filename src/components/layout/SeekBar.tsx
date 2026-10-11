import { formatDuration } from '../../lib/format'
import { Slider } from '../ui'
import styles from './SeekBar.module.css'

interface SeekBarProps {
  positionMs: number
  durationMs: number
  disabled?: boolean
  onSeek: (positionMs: number) => void
}

/** Elapsed time, seek slider, total time. The slider works in seconds so arrow keys move 1 s. */
export function SeekBar({ positionMs, durationMs, disabled, onSeek }: SeekBarProps) {
  const position = Math.min(positionMs, durationMs)
  return (
    <div className={styles.seek}>
      <span className={styles.time}>{formatDuration(position)}</span>
      <Slider
        label="Seek"
        value={position / 1000}
        max={durationMs / 1000}
        step="any"
        disabled={disabled}
        valueText={`${formatDuration(position)} of ${formatDuration(durationMs)}`}
        onChange={(seconds) => onSeek(seconds * 1000)}
      />
      <span className={styles.time}>{formatDuration(durationMs)}</span>
    </div>
  )
}
