import { CircleAlert, Hand, LogIn } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button, EmptyState, Spinner } from '../components/ui'
import { useAuth, type AuthError, type CallbackResult } from '../features/auth'
import { paths } from '../lib/paths'
import { usePageTitle } from '../lib/usePageTitle'

type Failure = Extract<CallbackResult, { ok: false }>

function titleFor(error: AuthError): string {
  switch (error.code) {
    case 'access-denied':
      return 'Spotify wasn’t connected'
    case 'not-configured':
      return 'Spotify sign-in isn’t set up'
    case 'network':
      return 'Couldn’t reach Spotify'
    default:
      return 'Couldn’t connect to Spotify'
  }
}

/**
 * Landing page for Spotify's redirect. It hands the query string to the auth session, which validates
 * `state`, exchanges the code and stores the session. On success it replaces this URL with the page the
 * user started from, so the one-time `code` never stays in the address bar or history.
 */
export function AuthCallback() {
  usePageTitle('Connecting to Spotify')
  const { actions } = useAuth()
  const { search, pathname } = useLocation()
  const navigate = useNavigate()
  const [failure, setFailure] = useState<Failure | null>(null)

  useEffect(() => {
    let cancelled = false
    void actions.handleCallback(search).then((result) => {
      if (cancelled) return
      if (result.ok) {
        navigate(result.returnTo, { replace: true })
      } else {
        // Remove the spent code/state from the address bar without re-running this effect.
        window.history.replaceState(window.history.state, '', pathname)
        setFailure(result)
      }
    })
    return () => {
      cancelled = true
    }
  }, [actions, search, pathname, navigate])

  if (!failure) {
    return (
      <EmptyState icon={<Spinner size={28} />} title="Connecting to Spotify…" description="Finishing sign-in. This only takes a moment.">
        <span className="visually-hidden" role="status">
          Finishing Spotify sign-in
        </span>
      </EmptyState>
    )
  }

  const { error, returnTo } = failure
  const cancelled = error.code === 'access-denied'
  return (
    <div role="alert">
      <EmptyState icon={cancelled ? <Hand size={28} /> : <CircleAlert size={28} />} title={titleFor(error)} description={error.message}>
        {error.retryable && error.code !== 'not-configured' && (
          <Button icon={<LogIn size={16} aria-hidden="true" />} onClick={() => void actions.login(returnTo)}>
            {cancelled ? 'Connect Spotify' : 'Try again'}
          </Button>
        )}
        <Link to={paths.home} style={{ color: 'var(--color-accent-hover)', fontWeight: 700, alignSelf: 'center' }}>
          Back to Orchid
        </Link>
      </EmptyState>
    </div>
  )
}
