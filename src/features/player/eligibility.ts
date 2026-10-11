import type { AuthStatus } from '../auth/types.ts'
import type { PlaybackStatus } from './types.ts'

/**
 * Whether the real Spotify engine may run. It needs a signed-in session that was granted the playback scopes
 * (the caller passes only the missing playback scopes). Premium cannot be read from the profile in development
 * mode, so it is NOT checked here: the SDK's own `account_error` is the authority.
 */
export type Eligibility = 'eligible' | 'pending' | 'sign-in-required' | 'reconnect-required' | 'unconfigured'

export function getEligibility(status: AuthStatus, missingScopes: readonly string[], configured: boolean): Eligibility {
  switch (status) {
    case 'signed-in':
      return missingScopes.length > 0 ? 'reconnect-required' : 'eligible'
    case 'restoring':
    case 'redirecting':
    case 'exchanging':
      return 'pending'
    default:
      return configured ? 'sign-in-required' : 'unconfigured'
  }
}

/** What the player bar says while the simulated engine is the one running. */
export function simulatedStatus(eligibility: Exclude<Eligibility, 'eligible'>, base: PlaybackStatus): PlaybackStatus {
  switch (eligibility) {
    case 'sign-in-required':
      return {
        ...base,
        availability: 'sign-in-required',
        detail: 'Connect Spotify to search and play real music.',
        action: 'sign-in',
      }
    case 'reconnect-required':
      return {
        ...base,
        availability: 'reconnect-required',
        detail: 'Orchid needs a new Spotify permission to play music here. Reconnect Spotify and approve it.',
        action: 'reconnect-spotify',
      }
    case 'pending':
      return { ...base, detail: 'Checking your Spotify connection…' }
    default:
      return base
  }
}
