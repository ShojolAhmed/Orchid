import { Plus } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui'
import { catalogService } from '../catalog'
import { usePlayer } from '../player'
import styles from './NewPlaylistForm.module.css'

/** Creates an empty, private playlist in the user's Spotify account. Reports Spotify's real answer. */
export function NewPlaylistForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { actions } = usePlayer()
  const fieldId = useId()

  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    catalogService.createPlaylist({ name: trimmed }).then(
      (created) => {
        actions.notify(`Created “${created.title}” (private) in your Spotify account`)
        setName('')
        setOpen(false)
        onCreated()
      },
      (failure: unknown) => setError(failure instanceof Error ? failure.message : 'Could not create the playlist.'),
    ).finally(() => setBusy(false))
  }

  if (!open) {
    return (
      <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>
        New playlist
      </Button>
    )
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      <label htmlFor={fieldId} className="visually-hidden">
        Playlist name
      </label>
      <input id={fieldId} className={styles.input} value={name} maxLength={100} placeholder="Playlist name" autoComplete="off" autoFocus onChange={(event) => setName(event.currentTarget.value)} />
      <Button type="submit" disabled={busy || name.trim() === ''}>
        {busy ? 'Creating…' : 'Create'}
      </Button>
      <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
        Cancel
      </Button>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
