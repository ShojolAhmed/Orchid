import { Volume1, Volume2, VolumeX } from 'lucide-react'
import { IconButton, Slider } from '../ui'
import styles from './VolumeControl.module.css'

interface VolumeControlProps {
  volume: number
  muted: boolean
  onVolume: (volume: number) => void
  onToggleMute: () => void
}

export function VolumeControl({ volume, muted, onVolume, onToggleMute }: VolumeControlProps) {
  const effective = muted ? 0 : volume
  const Icon = effective === 0 ? VolumeX : effective < 0.5 ? Volume1 : Volume2
  return (
    <div className={styles.volume}>
      <IconButton label={muted || volume === 0 ? 'Unmute' : 'Mute'} onClick={onToggleMute}>
        <Icon size={18} />
      </IconButton>
      <Slider label="Volume" value={Math.round(effective * 100)} max={100} valueText={`${Math.round(effective * 100)}%`} onChange={(v) => onVolume(v / 100)} className={styles.slider} />
    </div>
  )
}
