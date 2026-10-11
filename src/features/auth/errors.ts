import type { AuthError } from './types.ts'

/** Thrown by `getAccessToken` when there is no usable session. Carries a user-safe `AuthError`. */
export class AuthRequiredError extends Error {
  readonly authError: AuthError

  constructor(authError: AuthError) {
    super(authError.message)
    this.name = 'AuthRequiredError'
    this.authError = authError
  }
}

/**
 * Every user-facing auth message lives here so wording stays consistent and reviewable.
 * None of these ever interpolates a token, code, verifier or state value.
 */
export const authErrors = {
  notConfigured: (message: string): AuthError => ({ code: 'not-configured', message, retryable: false }),
  storageBlocked: (): AuthError => ({
    code: 'not-configured',
    message: 'Your browser is blocking the storage Orchid needs to sign in safely. Allow site data for this page and try again.',
    retryable: true,
  }),
  accessDenied: (): AuthError => ({
    code: 'access-denied',
    message: "Spotify access wasn't granted, so Orchid is still disconnected. You can try again whenever you're ready.",
    detail: 'access_denied',
    retryable: true,
  }),
  providerError: (detail: string | null): AuthError => ({
    code: 'provider-error',
    message: `Spotify reported a problem during sign-in${detail ? ` (${detail})` : ''}. Try again in a moment.`,
    ...(detail ? { detail } : {}),
    retryable: true,
  }),
  noAttempt: (): AuthError => ({
    code: 'callback-invalid',
    message: 'No Spotify sign-in was in progress in this tab. It may have expired, or the link was opened somewhere else. Start again from Orchid.',
    retryable: true,
  }),
  attemptExpired: (): AuthError => ({
    code: 'callback-invalid',
    message: 'That sign-in attempt took too long and expired. Start again.',
    retryable: true,
  }),
  stateMismatch: (): AuthError => ({
    code: 'callback-invalid',
    message: "This sign-in response didn't match the attempt started in this tab, so it was ignored for your security. Start again from Orchid.",
    retryable: true,
  }),
  missingCode: (): AuthError => ({
    code: 'callback-invalid',
    message: "Spotify didn't send an authorization code. Start again from Orchid.",
    retryable: true,
  }),
  exchangeRejected: (detail: string | null): AuthError => ({
    code: 'exchange-failed',
    message: `Spotify couldn't complete sign-in${detail ? ` (${detail})` : ''}. If this keeps happening, check that the redirect URI in the Developer Dashboard exactly matches the one Orchid uses.`,
    ...(detail ? { detail } : {}),
    retryable: false,
  }),
  exchangeMalformed: (): AuthError => ({
    code: 'exchange-failed',
    message: 'Spotify sent a response Orchid could not use. Try signing in again.',
    retryable: true,
  }),
  network: (): AuthError => ({
    code: 'network',
    message: "Couldn't reach Spotify. Check your connection and try again.",
    retryable: true,
  }),
  sessionExpired: (): AuthError => ({
    code: 'session-expired',
    message: 'Your Spotify session expired or was revoked. Connect again to continue.',
    detail: 'invalid_grant',
    retryable: false,
  }),
  restoreRejected: (detail: string | null): AuthError => ({
    code: 'exchange-failed',
    message: `Spotify declined to restore your saved session${detail ? ` (${detail})` : ''}. Connect again to continue.`,
    ...(detail ? { detail } : {}),
    retryable: false,
  }),
  notConnected: (): AuthError => ({
    code: 'session-expired',
    message: 'Connect your Spotify account to continue.',
    retryable: false,
  }),
  sessionEnded: (): AuthError => ({
    code: 'session-expired',
    message: 'This Spotify session was ended.',
    retryable: false,
  }),
} as const

export const profileMessages = {
  restricted:
    'Spotify accepted your sign-in but is refusing API access for this account. While an app is in development mode, only users added under User Management in the Developer Dashboard can use it, and the app owner needs an active Spotify Premium subscription.',
  rateLimited: 'Spotify is limiting requests right now. Try again in a little while.',
  failed: "Couldn't load your Spotify profile. Try again.",
} as const
