import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { AccountMenu, type AccountViewHandlers } from '../../components/layout'
import { toAccountView } from './accountView'
import { useAuth } from './AuthContext'

/** Binds the presentational account menu to the Spotify session. */
export function ConnectedAccountMenu() {
  const { state, actions, configIssues } = useAuth()
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}${location.hash}`

  const view = useMemo(() => toAccountView(state, configIssues), [state, configIssues])
  const handlers = useMemo<AccountViewHandlers>(
    () => ({
      onConnect: () => void actions.login(returnTo),
      onDisconnect: actions.logout,
      onRetryProfile: () => void actions.retryProfile(),
      onRetrySession: () => void actions.retryRestore(),
      onDismissAlert: actions.dismissError,
    }),
    [actions, returnTo],
  )
  return <AccountMenu view={view} handlers={handlers} />
}
