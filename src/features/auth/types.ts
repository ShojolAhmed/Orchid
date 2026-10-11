/**
 * Shared types for the Spotify auth layer. Everything under features/auth that
 * the unit tests import avoids `import.meta.env` and DOM globals, so it runs in Node.
 */

/** Public, non-secret configuration. PKCE for a public client needs no client secret. */
export interface AuthConfig {
  clientId: string
  redirectUri: string
  authorizeUrl: string
  tokenUrl: string
  apiBaseUrl: string
}

export type AuthErrorCode =
  /** Missing or unusable client ID / redirect URI. */
  | 'not-configured'
  /** The user cancelled or denied the permission request. */
  | 'access-denied'
  /** Callback is missing parameters, has no matching sign-in attempt, has expired, or failed the state check. */
  | 'callback-invalid'
  /** Spotify's authorization server returned some other error. */
  | 'provider-error'
  /** The token endpoint rejected the code exchange, or returned an unusable response. */
  | 'exchange-failed'
  /** Spotify could not be reached, or answered with a server error. Safe to retry. */
  | 'network'
  /** The saved session is expired, revoked, or otherwise unusable. The user must sign in again. */
  | 'session-expired'

export interface AuthError {
  code: AuthErrorCode
  /** Safe to show to the user. Never contains tokens, codes or verifiers. */
  message: string
  /** Optional machine-readable OAuth error name, such as `invalid_grant`. Allow-listed charset only. */
  detail?: string
  /** True when trying the same action again may succeed without user intervention. */
  retryable: boolean
}

/**
 * - restoring: a saved session exists and is being refreshed
 * - signed-out: no usable session
 * - redirecting: heading to Spotify's consent page
 * - exchanging: back from Spotify, trading the code for tokens
 * - signed-in: an access token is held in memory
 */
export type AuthStatus = 'restoring' | 'signed-out' | 'redirecting' | 'exchanging' | 'signed-in'

export interface SpotifyProfile {
  id: string
  displayName: string
  imageUrl: string | null
  profileUrl: string | null
  /** Only present when Spotify returns it (needs `user-read-private`, and is withheld for apps in development mode). */
  product: string | null
}

/**
 * - idle: not requested yet / signed out
 * - loading
 * - ready
 * - restricted: Spotify answered 403, typically a development-mode allowlist or owner-Premium problem
 * - error: transient failure (network, 429, 5xx). Retry may work.
 */
export type ProfileStatus = 'idle' | 'loading' | 'ready' | 'restricted' | 'error'

export interface AuthNotice {
  /** Increments for every notice, so identical messages can still be re-announced. */
  id: number
  tone: 'info' | 'warning'
  message: string
}

export interface AuthSnapshot {
  status: AuthStatus
  /** Last failure that the user should know about. Cleared by the next successful sign-in or by `dismissError`. */
  error: AuthError | null
  profile: SpotifyProfile | null
  profileStatus: ProfileStatus
  profileMessage: string | null
  /** Scopes Spotify reports as granted for the current session. */
  grantedScopes: readonly string[]
  /** Scopes the enabled features need but the current session lacks. Non-empty means "reconnect to grant". */
  missingScopes: readonly string[]
  /** A refresh token is stored on this device (even if we could not use it right now). */
  hasStoredSession: boolean
  notice: AuthNotice | null
}

/** Result of processing the OAuth redirect. */
export type CallbackResult = { ok: true; returnTo: string } | { ok: false; error: AuthError; returnTo: string }
