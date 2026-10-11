/**
 * One error type for every Spotify Web API failure. The `kind` decides what the UI shows and whether a
 * retry makes sense; `message` is always safe to display (never contains tokens or response bodies).
 */

export type ApiErrorKind =
  /** No session, or the session cannot produce a token. Connect Spotify. */
  | 'signed-out'
  /** Spotify rejected the token even after one refresh. Connecting again is the only fix. */
  | 'unauthorized'
  /** 403: development-mode allowlist, owner without Premium, a missing scope, or content Spotify does not share. */
  | 'forbidden'
  | 'not-found'
  /** 429 with a Retry-After the app chose not to wait for (or already waited once). */
  | 'rate-limited'
  /** 429 with `reason: QUOTA_EXCEEDED` (July 2026 changelog): waiting briefly will not help. */
  | 'quota-exceeded'
  | 'bad-request'
  | 'server'
  | 'network'
  /** The response was not the JSON the app expects. */
  | 'malformed'
  /** The caller cancelled. Never shown to the user. */
  | 'aborted'

export class SpotifyApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | null
  /** Spotify's `error.reason` or `error.message`, only for logging and tests; not shown to users. */
  readonly reason: string | null
  readonly retryAfterSeconds: number | null

  constructor(kind: ApiErrorKind, status: number | null = null, reason: string | null = null, retryAfterSeconds: number | null = null) {
    super(apiErrorMessages[kind](retryAfterSeconds))
    this.name = 'SpotifyApiError'
    this.kind = kind
    this.status = status
    this.reason = reason
    this.retryAfterSeconds = retryAfterSeconds
  }
}

const apiErrorMessages: Record<ApiErrorKind, (retryAfter: number | null) => string> = {
  'signed-out': () => 'Connect your Spotify account to continue.',
  unauthorized: () => 'Spotify did not accept your session. Connect Spotify again to continue.',
  forbidden: () => 'Spotify refused this request for your account.',
  'not-found': () => 'Spotify could not find that item.',
  'rate-limited': (seconds) => (seconds ? `Spotify is limiting requests right now. Try again in about ${seconds} seconds.` : 'Spotify is limiting requests right now. Try again in a little while.'),
  'quota-exceeded': () => "This app has used up its Spotify request quota for now. Try again later; retrying immediately will not help.",
  'bad-request': () => 'Spotify could not understand that request.',
  server: () => 'Spotify is having trouble right now. Try again in a moment.',
  network: () => "Couldn't reach Spotify. Check your connection and try again.",
  malformed: () => 'Spotify sent a response Orchid could not read.',
  aborted: () => 'The request was cancelled.',
}

export function isSpotifyApiError(error: unknown): error is SpotifyApiError {
  return error instanceof SpotifyApiError
}

/** True for a deliberate cancel (a newer search replaced this one, the page was left). Callers ignore these. */
export function isAbort(error: unknown): boolean {
  return (isSpotifyApiError(error) && error.kind === 'aborted') || (error instanceof DOMException && error.name === 'AbortError')
}

/** Kinds where trying the identical request again may work without the person doing anything else. */
export function isRetryable(error: unknown): boolean {
  return isSpotifyApiError(error) && (error.kind === 'network' || error.kind === 'server' || error.kind === 'rate-limited')
}

/**
 * Plain-language text for a 403, used where the cause is likely the development-mode rules. Spotify does
 * not say which rule was broken, so the text lists the possibilities instead of guessing one.
 */
export const FORBIDDEN_EXPLANATION =
  'Spotify refused this request. While an app is in development mode, only people added under User Management in the Developer Dashboard can use it, the app owner needs an active Premium subscription, and Spotify withholds some data entirely. Reconnecting can also help if a permission was missing.'

/** A 403 whose body names a scope problem ("Insufficient client scope"). The fix is to reconnect, not to wait. */
export function isInsufficientScope(error: unknown): boolean {
  return isSpotifyApiError(error) && error.kind === 'forbidden' && /scope/i.test(error.reason ?? '')
}
