import { createContext, useContext } from 'react'
import type { ConfigIssue } from './config'
import type { AuthSnapshot, CallbackResult } from './types'

export interface AuthActions {
  /** Sends the user to Spotify. `returnTo` is where to come back to inside the app. */
  login: (returnTo?: string) => Promise<void>
  logout: () => void
  handleCallback: (search: string) => Promise<CallbackResult>
  /** For feature code: a valid access token, refreshed if needed. Rejects with `AuthRequiredError`. */
  getAccessToken: () => Promise<string>
  invalidateAccessToken: () => void
  retryProfile: () => Promise<void>
  retryRestore: () => Promise<void>
  dismissError: () => void
}

export interface AuthApi {
  state: AuthSnapshot
  actions: AuthActions
  /** Problems with the app's own Spotify configuration. Empty when sign-in can work. */
  configIssues: readonly ConfigIssue[]
}

export const AuthContext = createContext<AuthApi | null>(null)

export function useAuth(): AuthApi {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
