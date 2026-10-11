import type { AccountAlert, AccountPhase, AccountViewState } from '../../components/layout'
import type { ConfigIssue } from './config'
import type { AuthSnapshot } from './types'

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

function phaseOf(status: AuthSnapshot['status']): AccountPhase {
  switch (status) {
    case 'restoring':
      return 'checking'
    case 'redirecting':
    case 'exchanging':
      return 'connecting'
    case 'signed-in':
      return 'connected'
    default:
      return 'signed-out'
  }
}

function alertOf(state: AuthSnapshot): AccountAlert | null {
  if (state.error) {
    const retryable = state.error.code === 'network' && state.hasStoredSession
    return { tone: state.error.code === 'network' ? 'warning' : 'error', text: state.error.message, action: retryable ? 'retry-session' : null, dismissible: true }
  }
  if (state.status !== 'signed-in') return null
  if (state.profileStatus === 'restricted' && state.profileMessage) return { tone: 'warning', text: state.profileMessage, action: null, dismissible: false }
  if (state.profileStatus === 'error' && state.profileMessage) return { tone: 'warning', text: state.profileMessage, action: 'retry-profile', dismissible: false }
  if (state.missingScopes.length > 0) return { tone: 'info', text: 'Orchid needs permissions that this connection does not include yet. Reconnect to grant them.', action: 'reconnect', dismissible: false }
  return null
}

/** Maps auth state onto the account menu's view model. Pure, so it stays easy to reason about. */
export function toAccountView(state: AuthSnapshot, issues: readonly ConfigIssue[]): AccountViewState {
  const phase = phaseOf(state.status)
  const { profile } = state
  return {
    phase,
    busyLabel: state.status === 'restoring' ? 'Reconnecting…' : state.status === 'redirecting' ? 'Opening Spotify…' : state.status === 'exchanging' ? 'Finishing sign-in…' : null,
    profile: profile
      ? { name: profile.displayName, imageUrl: profile.imageUrl, detail: profile.product ? `Spotify ${titleCase(profile.product)}` : null, profileUrl: profile.profileUrl }
      : null,
    profileState: state.profileStatus === 'ready' ? 'ready' : state.profileStatus === 'restricted' ? 'restricted' : state.profileStatus === 'error' ? 'error' : 'loading',
    alert: alertOf(state),
    problems: phase === 'signed-out' ? issues.map((issue) => issue.message) : [],
  }
}
