import type { CSSProperties } from 'react'
import styles from './Slider.module.css'

interface SliderProps {
  /** Accessible name. */
  label: string
  value: number
  max: number
  min?: number
  step?: number | 'any'
  /** Spoken value, e.g. "1:23 of 3:45". */
  valueText?: string
  disabled?: boolean
  onChange: (value: number) => void
  className?: string
}

/** Native range input styled to match the player. Keyboard and touch work for free. */
export function Slider({ label, value, max, min = 0, step = 1, valueText, disabled, onChange, className }: SliderProps) {
  const span = max - min
  const fill = span > 0 ? Math.min(100, Math.max(0, ((value - min) / span) * 100)) : 0
  return (
    <input
      type="range"
      className={[styles.slider, className].filter(Boolean).join(' ')}
      style={{ '--fill': `${fill}%` } as CSSProperties}
      aria-label={label}
      aria-valuetext={valueText}
      min={min}
      max={span > 0 ? max : min + 1}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.currentTarget.value))}
    />
  )
}
