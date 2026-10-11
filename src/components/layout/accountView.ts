/** View models for the account menu. The auth feature maps its state onto these, so components never import it. */

/**
 * - checking: a saved session is being restored
 * - signed-out: not connected
 * - connecting: redirecting to Spotify or finishing the exchange
 * - connected: a Spotify session exists
 */
export type AccountPhase = 'checking' | 'signed-out' | 'connecting' | 'connected'

export interface AccountProfileView {
  name: string
  imageUrl: string | null
  /** For example "Spotify Premium". Only shown when Spotify actually reported it. */
  detail: string | null
  profileUrl: string | null
}

export interface AccountAlert {
  tone: 'info' | 'warning' | 'error'
  text: string
  /** Which recovery button to offer next to the message, if any. */
  action: 'retry-profile' | 'retry-session' | 'reconnect' | null
  /** Whether dismissing clears it. Alerts that reflect a lasting condition (restricted account) are not dismissible. */
  dismissible: boolean
}

export interface AccountViewState {
  phase: AccountPhase
  /** Visible label while `phase` is checking or connecting. */
  busyLabel: string | null
  profile: AccountProfileView | null
  /** Connected, but the profile has not arrived (yet) or cannot be had. */
  profileState: 'loading' | 'ready' | 'restricted' | 'error'
  alert: AccountAlert | null
  /** Configuration problems that stop sign-in from working. Shown while signed out. */
  problems: string[]
}

export interface AccountViewHandlers {
  onConnect: () => void
  onDisconnect: () => void
  onRetryProfile: () => void
  onRetrySession: () => void
  onDismissAlert: () => void
}
