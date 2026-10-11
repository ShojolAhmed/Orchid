import { Plug } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { Button, ErrorState, RestrictedState } from '../../components/ui'
import { FORBIDDEN_EXPLANATION, isInsufficientScope, isSpotifyApiError } from '../api'
import { useAuth } from '../auth'

interface ApiErrorStateProps {
  error: Error
  onRetry?: () => void
  /** Short title for generic failures, e.g. "Search failed". */
  title?: string
}

/** Turns any data-loading failure into the right state: reconnect, restricted, wait, or retry. */
export function ApiErrorState({ error, onRetry, title }: ApiErrorStateProps) {
  const { actions } = useAuth()
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}${location.hash}`
  const connect = (label: string) => (
    <Button icon={<Plug size={16} />} onClick={() => void actions.login(returnTo)}>
      {label}
    </Button>
  )

  if (!isSpotifyApiError(error)) return <ErrorState {...(title ? { title } : {})} {...(onRetry ? { onRetry } : {})} />

  switch (error.kind) {
    case 'signed-out':
      return <RestrictedState title="Connect Spotify to continue" description={error.message}>{connect('Connect Spotify')}</RestrictedState>
    case 'unauthorized':
      return <RestrictedState title="Spotify needs you to reconnect" description={error.message}>{connect('Reconnect Spotify')}</RestrictedState>
    case 'forbidden':
      return isInsufficientScope(error) ? (
        <RestrictedState title="Permission missing" description="Spotify says this connection lacks a permission Orchid needs. Reconnect and approve it.">{connect('Reconnect Spotify')}</RestrictedState>
      ) : (
        <RestrictedState title="Spotify won't share this" description={FORBIDDEN_EXPLANATION} />
      )
    case 'quota-exceeded':
      return <RestrictedState title="Request quota used up" description={error.message} />
    case 'rate-limited':
      return <ErrorState title="Slow down a moment" description={error.message} {...(onRetry ? { onRetry } : {})} />
    default:
      return <ErrorState title={title ?? 'Something went wrong'} description={error.message} {...(onRetry ? { onRetry } : {})} />
  }
}
