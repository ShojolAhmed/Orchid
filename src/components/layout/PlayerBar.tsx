import { Link } from 'react-router-dom'
import { ListMusic, MonitorSpeaker } from 'lucide-react'
import { Artwork, Button, IconButton, Popover } from '../ui'
import { SeekBar } from './SeekBar'
import { TransportControls } from './TransportControls'
import { VolumeControl } from './VolumeControl'
import type { PlayerViewHandlers, PlayerViewState } from './playerView'
import styles from './PlayerBar.module.css'

interface PlayerBarProps {
  state: PlayerViewState
  handlers: PlayerViewHandlers
  /** Mobile: tapping the track opens the full-screen now-playing view. */
  onOpenNowPlaying: () => void
}

const toneClass = { ok: 'deviceOk', info: 'deviceInfo', busy: 'deviceBusy', warn: 'deviceWarn' } as const

/** Presentational player. State and handlers come from whichever engine is active. */
export function PlayerBar({ state, handlers, onOpenNowPlaying }: PlayerBarProps) {
  const { track } = state
  return (
    <footer className={styles.player} aria-label="Player">
      <div className={styles.track}>
        {track ? (
          <>
            <button type="button" className={styles.expand} aria-label={`Open now playing: ${track.title}`} onClick={onOpenNowPlaying}>
              <Artwork source={track.artwork} label={track.title} className={styles.art} />
            </button>
            <div className={styles.meta}>
              <Link to={track.albumHref} className={styles.title}>
                {track.title}
              </Link>
              <Link to={track.artistHref} className={styles.subtitle}>
                {track.artistName}
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className={styles.emptyArt} aria-hidden="true" />
            <div className={styles.meta}>
              <p className={styles.titleStatic}>Nothing playing</p>
              <p className={styles.subtitleStatic}>{state.statusText ?? 'Pick something to start'}</p>
            </div>
          </>
        )}
      </div>

      <div className={styles.center}>
        <TransportControls state={state} handlers={handlers} />
        <div className={styles.seekRow}>
          <SeekBar positionMs={state.positionMs} durationMs={track?.durationMs ?? 0} disabled={!track} onSeek={handlers.onSeek} />
        </div>
      </div>

      <div className={styles.extras}>
        <IconButton label={state.queueOpen ? 'Hide queue' : 'Show queue'} active={state.queueOpen} aria-pressed={state.queueOpen} onClick={handlers.onToggleQueue}>
          <ListMusic size={18} />
        </IconButton>
        <Popover label="Devices" icon={<MonitorSpeaker size={18} />} placement="top">
          <div className={styles.devices}>
            <p className={styles.devicesTitle}>Connect to a device</p>
            <p className={[styles.device, styles[toneClass[state.device.tone]]].join(' ')}>
              <MonitorSpeaker size={18} aria-hidden="true" />
              <span>
                {state.device.name}
                <small>{state.device.label}</small>
              </span>
            </p>
            {state.device.detail ? <p className={styles.devicesNote}>{state.device.detail}</p> : null}
            {state.device.actionLabel ? (
              <Button variant="secondary" className={styles.deviceAction} onClick={handlers.onDeviceAction}>
                {state.device.actionLabel}
              </Button>
            ) : null}
          </div>
        </Popover>
        <div className={styles.volumeWrap}>
          <VolumeControl volume={state.volume} muted={state.muted} onVolume={handlers.onVolume} onToggleMute={handlers.onToggleMute} />
        </div>
      </div>

      {/* Mobile mini player: compact controls + thin progress line */}
      <div className={styles.mini}>
        <TransportControls state={state} handlers={handlers} compact />
      </div>
      <div className={styles.miniProgress} aria-hidden="true">
        <span style={{ width: `${track ? Math.min(100, (state.positionMs / track.durationMs) * 100) : 0}%` }} />
      </div>
    </footer>
  )
}
