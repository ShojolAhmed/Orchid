import { ExternalLink, LogIn, LogOut, RefreshCw, TriangleAlert, User } from 'lucide-react'
import { useState } from 'react'
import { Button, Popover, Skeleton, Spinner } from '../ui'
import type { AccountViewHandlers, AccountViewState } from './accountView'
import styles from './AccountMenu.module.css'

interface AccountMenuProps {
  view: AccountViewState
  handlers: AccountViewHandlers
}

function Avatar({ name, imageUrl, size }: { name: string; imageUrl: string | null; size: number }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const initial = [...name.trim()][0]?.toUpperCase() ?? '?'
  return (
    <span className={styles.avatar} style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden="true">
      {imageUrl && failedUrl !== imageUrl ? <img src={imageUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailedUrl(imageUrl)} /> : initial}
    </span>
  )
}

/**
 * Account area of the top bar: a visible "Connect Spotify" action while signed out, and a popover with
 * profile, messages and disconnect. Presentational: it only renders the view model it is given.
 */
export function AccountMenu({ view, handlers }: AccountMenuProps) {
  const { phase, profile, alert } = view
  const connected = phase === 'connected'
  const needsAttention = Boolean(alert) || view.problems.length > 0 || view.profileState === 'restricted'
  const label = connected ? `Account${profile ? `, ${profile.name}` : ''}` : 'Account'

  return (
    <div className={styles.root}>
      {phase === 'signed-out' && (
        <Button className={styles.connect} icon={<LogIn size={16} aria-hidden="true" />} onClick={handlers.onConnect}>
          <span className={styles.long}>Connect Spotify</span>
          <span className={styles.short}>Connect</span>
        </Button>
      )}
      {(phase === 'connecting' || phase === 'checking') && (
        <p className={styles.busy} role="status">
          <Spinner size={16} />
          <span>{view.busyLabel ?? 'Working…'}</span>
        </p>
      )}

      <div className={styles.trigger}>
        <Popover label={label} icon={connected ? <Avatar name={profile?.name ?? 'Spotify'} imageUrl={profile?.imageUrl ?? null} size={28} /> : <User size={20} aria-hidden="true" />}>
          <div className={styles.panel}>{connected ? <ConnectedPanel view={view} handlers={handlers} /> : <SignedOutPanel view={view} handlers={handlers} />}</div>
        </Popover>
        {needsAttention && <span className={styles.dot} aria-hidden="true" />}
      </div>
    </div>
  )
}

function AlertBox({ view, handlers }: AccountMenuProps) {
  const { alert } = view
  if (!alert) return null
  const action =
    alert.action === 'retry-profile'
      ? { label: 'Try again', onClick: handlers.onRetryProfile, icon: <RefreshCw size={14} aria-hidden="true" /> }
      : alert.action === 'retry-session'
        ? { label: 'Try again', onClick: handlers.onRetrySession, icon: <RefreshCw size={14} aria-hidden="true" /> }
        : alert.action === 'reconnect'
          ? { label: 'Reconnect', onClick: handlers.onConnect, icon: <LogIn size={14} aria-hidden="true" /> }
          : null
  return (
    <div className={styles.alert} data-tone={alert.tone} role={alert.tone === 'error' ? 'alert' : 'status'}>
      <p>{alert.text}</p>
      <div className={styles.alertActions}>
        {action && (
          <Button variant="secondary" className={styles.small} icon={action.icon} onClick={action.onClick}>
            {action.label}
          </Button>
        )}
        {alert.dismissible && (
          <Button variant="ghost" className={styles.small} onClick={handlers.onDismissAlert}>
            Dismiss
          </Button>
        )}
      </div>
    </div>
  )
}

function SignedOutPanel({ view, handlers }: AccountMenuProps) {
  const busy = view.phase === 'connecting' || view.phase === 'checking'
  const blocked = view.problems.length > 0
  return (
    <>
      <p className={styles.name}>Not connected</p>
      <p className={styles.text}>Orchid is showing sample music. Connect your own Spotify account to sign in; Orchid never sees your Spotify password.</p>
      <AlertBox view={view} handlers={handlers} />
      {blocked && (
        <>
          <p className={styles.text}>
            <TriangleAlert size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--color-warning)' }} />
            Sign-in isn’t set up yet:
          </p>
          <ul className={styles.problems}>
            {view.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
          <p className={styles.fine}>See the “Spotify setup” section of the README.</p>
        </>
      )}
      <Button disabled={busy || blocked} icon={busy ? <Spinner size={16} /> : <LogIn size={16} aria-hidden="true" />} onClick={handlers.onConnect}>
        {busy ? (view.busyLabel ?? 'Working…') : 'Connect Spotify'}
      </Button>
    </>
  )
}

function ConnectedPanel({ view, handlers }: AccountMenuProps) {
  const { profile, profileState } = view
  const title = profile?.name ?? (profileState === 'loading' ? 'Loading your profile…' : profileState === 'restricted' ? 'Spotify is restricting access' : 'Connected to Spotify')
  return (
    <>
      <div className={styles.who}>
        {profile ? <Avatar name={profile.name} imageUrl={profile.imageUrl} size={44} /> : profileState === 'loading' ? <Skeleton width="2.75rem" height="2.75rem" radius="50%" /> : <Avatar name="S" imageUrl={null} size={44} />}
        <div className={styles.whoText}>
          <p className={styles.name} title={title}>
            {title}
          </p>
          {profile?.detail && <p className={styles.detail}>{profile.detail}</p>}
          {profile?.profileUrl && (
            <a className={styles.link} href={profile.profileUrl} target="_blank" rel="noopener noreferrer">
              View on Spotify <ExternalLink size={12} aria-hidden="true" style={{ verticalAlign: '-1px' }} />
            </a>
          )}
        </div>
      </div>
      <AlertBox view={view} handlers={handlers} />
      <Button variant="secondary" icon={<LogOut size={16} aria-hidden="true" />} onClick={handlers.onDisconnect}>
        Disconnect
      </Button>
      <p className={styles.fine}>
        Disconnect removes Orchid’s saved sign-in from this browser. To revoke its access entirely, remove Orchid on your{' '}
        <a href="https://www.spotify.com/account/apps/" target="_blank" rel="noopener noreferrer">
          Spotify account’s apps page
        </a>
        .
      </p>
    </>
  )
}

