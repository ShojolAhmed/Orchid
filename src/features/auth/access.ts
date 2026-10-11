import { findMissingScopes, scopesForFeatures, type FeatureId } from './scopes.ts'
import type { AuthStatus } from './types.ts'

/**
 * Whether the signed-in session may use a feature. Pages use this to choose between loading data, asking
 * the person to connect, or asking them to reconnect for a new permission, without making a request that
 * is certain to fail.
 */
export type Access =
  | { status: 'granted' }
  /** A session is being restored or exchanged; decide nothing yet. */
  | { status: 'pending' }
  | { status: 'signed-out' }
  /** The app has no client id or redirect URI, so connecting is impossible. */
  | { status: 'unconfigured' }
  /** Signed in, but the session was created before these permissions existed. Reconnecting asks for them. */
  | { status: 'reconnect'; missing: string[] }

export function evaluateAccess(authStatus: AuthStatus, grantedScopes: readonly string[], features: readonly FeatureId[], configured: boolean): Access {
  switch (authStatus) {
    case 'restoring':
    case 'redirecting':
    case 'exchanging':
      return { status: 'pending' }
    case 'signed-out':
      return configured ? { status: 'signed-out' } : { status: 'unconfigured' }
    case 'signed-in': {
      const missing = findMissingScopes(scopesForFeatures(features), grantedScopes)
      return missing.length > 0 ? { status: 'reconnect', missing } : { status: 'granted' }
    }
  }
}
