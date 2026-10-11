import { Plug } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Button, RestrictedState, Spinner } from '../../components/ui'
import type { Access } from './access'
import { useAuth } from './AuthContext'

interface AccessGateProps {
  access: Access
  /** Finishes "Connect Spotify to ...", e.g. "search" or "see your library". */
  what: string
  children: ReactNode
}

/** Shows the page content only when the session may use the feature; otherwise says exactly what to do. */
export function AccessGate({ access, what, children }: AccessGateProps) {
  const { actions } = useAuth()
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}${location.hash}`

  switch (access.status) {
    case 'granted':
      return <>{children}</>
    case 'pending':
      return (
        <p role="status" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-text-muted)' }}>
          <Spinner /> Checking your Spotify connection…
        </p>
      )
    case 'unconfigured':
      return <RestrictedState title="Spotify isn't set up" description="This copy of Orchid has no Spotify client ID or redirect URI. See the README, then restart the dev server." />
    case 'signed-out':
      return (
        <RestrictedState title={`Connect Spotify to ${what}`} description="Orchid shows only your real Spotify data, so it needs you to connect first. Nothing is shown until you do.">
          <Button icon={<Plug size={16} />} onClick={() => void actions.login(returnTo)}>
            Connect Spotify
          </Button>
        </RestrictedState>
      )
    case 'reconnect':
      return (
        <RestrictedState title={`Reconnect Spotify to ${what}`} description="Orchid asks for a permission that your current connection doesn't include. Reconnect and approve it; your playback keeps working in the meantime.">
          <Button icon={<Plug size={16} />} onClick={() => void actions.login(returnTo)}>
            Reconnect Spotify
          </Button>
        </RestrictedState>
      )
  }
}
