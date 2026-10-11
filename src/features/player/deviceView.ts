import type { DeviceView } from '../../components/layout/playerView'
import type { PlaybackAction, PlaybackStatus } from './types'

const ACTION_LABELS: Record<PlaybackAction, string> = {
  'sign-in': 'Connect Spotify',
  'reconnect-spotify': 'Reconnect Spotify',
  'retry-player': 'Retry player',
  'play-here': 'Play on this browser',
}

/** Turns the engine's status into what the devices menu shows. */
export function toDeviceView(status: PlaybackStatus): DeviceView {
  const tone: DeviceView['tone'] =
    status.availability === 'ready'
      ? 'ok'
      : status.availability === 'error' || status.availability === 'reconnect-required'
        ? 'warn'
        : status.availability === 'loading' || status.availability === 'connecting' || status.availability === 'reconnecting'
          ? 'busy'
          : 'info'
  return {
    name: status.deviceName ?? 'This browser',
    label: status.label,
    detail: status.detail,
    tone,
    actionLabel: status.action ? ACTION_LABELS[status.action] : null,
  }
}
