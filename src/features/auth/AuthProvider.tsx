import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { spotifyConfig } from '../../config/spotify'
import { AuthContext, type AuthApi, type AuthActions } from './AuthContext'
import { getConfigIssues } from './config'
import { getSpotifySession } from './instance'
import { CREDENTIALS_KEY } from './storage'

/**
 * Binds the framework-free Spotify session to React. It owns no auth logic: it subscribes to the
 * session, restores a saved session once, and keeps tabs in sync.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const session = getSpotifySession()
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)

  useEffect(() => {
    void session.initialize()

    // Another tab signed in or out (or localStorage was cleared): follow it.
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === CREDENTIALS_KEY) session.handleExternalStorageChange()
    }
    // Back from Spotify's page via the back/forward cache: the page is restored as it was, mid-redirect.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) session.handlePageRestored()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [session])

  const actions = useMemo<AuthActions>(
    () => ({
      login: session.login,
      logout: session.logout,
      handleCallback: session.handleCallback,
      getAccessToken: session.getAccessToken,
      invalidateAccessToken: session.invalidateAccessToken,
      retryProfile: session.retryProfile,
      retryRestore: session.retryRestore,
      dismissError: session.dismissError,
    }),
    [session],
  )
  const configIssues = useMemo(() => getConfigIssues(spotifyConfig, window.location.origin), [])
  const value = useMemo<AuthApi>(() => ({ state, actions, configIssues }), [state, actions, configIssues])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
