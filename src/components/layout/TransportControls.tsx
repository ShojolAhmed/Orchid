import { Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react'
import { IconButton } from '../ui'
import type { PlayerViewHandlers, PlayerViewState } from './playerView'
import styles from './TransportControls.module.css'

interface TransportControlsProps {
  state: Pick<PlayerViewState, 'track' | 'isPlaying' | 'shuffle' | 'repeat' | 'busy'>
  handlers: Pick<PlayerViewHandlers, 'onTogglePlay' | 'onPrevious' | 'onNext' | 'onToggleShuffle' | 'onCycleRepeat'>
  /** Hide shuffle and repeat (compact mini player). */
  compact?: boolean
  large?: boolean
}

const repeatLabel = { off: 'Enable repeat', all: 'Enable repeat one', one: 'Disable repeat' } as const

export function TransportControls({ state, handlers, compact = false, large = false }: TransportControlsProps) {
  const disabled = !state.track
  const RepeatIcon = state.repeat === 'one' ? Repeat1 : Repeat
  const iconSize = large ? 26 : 20
  return (
    <div className={[styles.controls, large && styles.large].filter(Boolean).join(' ')}>
      {compact ? null : (
        <IconButton label={state.shuffle ? 'Disable shuffle' : 'Enable shuffle'} active={state.shuffle} aria-pressed={state.shuffle} disabled={disabled} onClick={handlers.onToggleShuffle}>
          <Shuffle size={18} />
        </IconButton>
      )}
      <IconButton label="Previous" disabled={disabled} onClick={handlers.onPrevious}>
        <SkipBack size={iconSize} fill="currentColor" />
      </IconButton>
      <button type="button" className={styles.play} aria-label={state.isPlaying ? 'Pause' : 'Play'} aria-busy={state.busy || undefined} disabled={disabled || state.busy} onClick={handlers.onTogglePlay}>
        {state.isPlaying ? <Pause size={iconSize} fill="currentColor" /> : <Play size={iconSize} fill="currentColor" />}
      </button>
      <IconButton label="Next" disabled={disabled} onClick={handlers.onNext}>
        <SkipForward size={iconSize} fill="currentColor" />
      </IconButton>
      {compact ? null : (
        <IconButton label={repeatLabel[state.repeat]} active={state.repeat !== 'off'} aria-pressed={state.repeat !== 'off'} disabled={disabled} onClick={handlers.onCycleRepeat}>
          <RepeatIcon size={18} />
        </IconButton>
      )}
    </div>
  )
}
