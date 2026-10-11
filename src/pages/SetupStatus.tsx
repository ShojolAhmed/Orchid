import { useState, type FormEvent } from 'react'
import { CheckCircle2, CircleAlert } from 'lucide-react'
import { Button } from '../components/ui'
import { spotifyConfig } from '../config/spotify'
import { useAuth, type AuthSnapshot } from '../features/auth'
import { usePlayer } from '../features/player'
import styles from './SetupStatus.module.css'

function connectionLabel(state: AuthSnapshot): { ok: boolean; text: string } {
  switch (state.status) {
    case 'signed-in':
      if (state.profileStatus === 'restricted') return { ok: false, text: 'Signed in, but Spotify is restricting API access for this account' }
      return { ok: true, text: state.profile ? `Connected as ${state.profile.displayName}` : 'Connected to Spotify' }
    case 'restoring':
      return { ok: false, text: 'Checking for a saved Spotify session…' }
    case 'redirecting':
    case 'exchanging':
      return { ok: false, text: 'Connecting to Spotify…' }
    default:
      return { ok: false, text: 'Not connected to Spotify yet' }
  }
}

/**
 * Home footer panel. The configuration/connection checklist is a developer aid and only renders in
 * development builds (`import.meta.env.DEV`); production visitors never see setup hints or `.env` advice.
 * The "Play a Spotify link" form is a real feature and stays whenever the Spotify player is ready.
 */
export function SetupStatus() {
  const { state, configIssues } = useAuth()
  const { engine, status, actions } = usePlayer()
  const [link, setLink] = useState('')
  const connection = connectionLabel(state)
  const ready = configIssues.length === 0
  const redirectIssues = configIssues.filter((issue) => issue.code !== 'missing-client-id')
  const showDiagnostics = import.meta.env.DEV
  const showLink = engine === 'spotify' && status.availability === 'ready'

  if (!showDiagnostics && !showLink) return null

  const playLink = (event: FormEvent) => {
    event.preventDefault()
    actions.playSpotifyLink(link)
  }

  return (
    <section className={styles.status} aria-labelledby={showDiagnostics ? 'setup-heading' : undefined} aria-label={showDiagnostics ? undefined : 'Play a Spotify link'}>
      {showDiagnostics ? (
        <>
          <h2 id="setup-heading" className={styles.title}>
            Setup status (development only)
          </h2>
          <ul className={styles.checks}>
            <Check ok={Boolean(spotifyConfig.clientId)} good="Spotify client ID found" bad="Missing VITE_SPOTIFY_CLIENT_ID" />
            {redirectIssues.length === 0 ? <Check ok good="Redirect URI is valid for this app" bad="" /> : redirectIssues.map((issue) => <Check key={issue.code} ok={false} good="" bad={issue.message} />)}
            <Check ok={connection.ok} good={connection.text} bad={connection.text} />
            <Check
              ok={status.availability === 'ready'}
              good={status.label}
              bad={engine === 'mock' ? `Playback is simulated. ${status.detail ?? ''}`.trim() : [status.label, status.detail].filter(Boolean).join('. ')}
            />
          </ul>
          {!ready && <p className={styles.hint}>Copy .env.example to .env.local, fill it in, then restart the dev server. The README’s “Spotify setup” section has the steps.</p>}
        </>
      ) : null}
      {showLink ? (
        <form className={styles.link} onSubmit={playLink}>
          <label htmlFor="spotify-link" className={styles.linkLabel}>
            Play a Spotify link
          </label>
          <div className={styles.linkRow}>
            <input
              id="spotify-link"
              className={styles.input}
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="open.spotify.com/track/… or spotify:album:…"
              aria-describedby="spotify-link-hint"
              value={link}
              onChange={(event) => setLink(event.currentTarget.value)}
            />
            <Button type="submit" disabled={!link.trim() || status.busy}>
              Play
            </Button>
          </div>
          <p id="spotify-link-hint" className={styles.hint}>
            Plays on this browser. Paste a Spotify track, album, artist or playlist link. Needs Spotify Premium.
          </p>
        </form>
      ) : null}
    </section>
  )
}

function Check({ ok, good, bad }: { ok: boolean; good: string; bad: string }) {
  return (
    <li className={styles.check}>
      {ok ? <CheckCircle2 size={18} className={styles.ok} aria-hidden="true" /> : <CircleAlert size={18} className={styles.warn} aria-hidden="true" />}
      <span>{ok ? good : bad}</span>
    </li>
  )
}
