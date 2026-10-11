import { useId, useRef, useState, type FormEvent } from 'react'
import { Button } from './Button'
import { Spinner } from './Spinner'
import styles from './PlaylistPicker.module.css'

export interface PickerPlaylist {
  id: string
  title: string
  subtitle: string
}

interface PlaylistPickerProps {
  /** Name of the thing being added, for the heading. */
  subject: string
  status: 'loading' | 'ready' | 'error'
  playlists: PickerPlaylist[]
  /** The playlist an add request is running for. */
  busyId: string | null
  creating: boolean
  /** Result of the last action ("Added to X", or why it failed). Announced politely. */
  message: string | null
  onPick: (playlistId: string) => void
  onCreate: (name: string) => void
  onRetry: () => void
}

/** Choose one of your own playlists, or create a new private one, to add a track to. */
export function PlaylistPicker({ subject, status, playlists, busyId, creating, message, onPick, onCreate, onRetry }: PlaylistPickerProps) {
  const [name, setName] = useState('')
  const fieldId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const working = busyId !== null || creating

  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed && !working) {
      onCreate(trimmed)
      setName('')
      // The Create button disables itself (empty name, request running); keep keyboard focus somewhere real.
      inputRef.current?.focus()
    }
  }

  return (
    <div className={styles.picker}>
      <p className={styles.heading}>Add “{subject}” to a playlist</p>

      {status === 'loading' ? (
        <p className={styles.note}>
          <Spinner /> Loading your playlists…
        </p>
      ) : status === 'error' ? (
        <div className={styles.note}>
          <p>Couldn't load your playlists.</p>
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : playlists.length === 0 ? (
        <p className={styles.note}>You don't own or collaborate on any playlists yet. Create one below.</p>
      ) : (
        <ul className={styles.list} aria-label="Your playlists">
          {playlists.map((playlist) => (
            <li key={playlist.id}>
              <button
                type="button"
                className={styles.option}
                // aria-disabled, not disabled: a disabled button drops keyboard focus to <body> mid-request.
                aria-disabled={working || undefined}
                aria-busy={busyId === playlist.id || undefined}
                onClick={() => {
                  if (!working) onPick(playlist.id)
                }}
              >
                <span className={styles.optionTitle}>{playlist.title}</span>
                <span className={styles.optionSub}>{busyId === playlist.id ? 'Adding…' : playlist.subtitle}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className={styles.create} onSubmit={submit}>
        <label htmlFor={fieldId} className={styles.label}>
          New private playlist
        </label>
        <div className={styles.row}>
          <input ref={inputRef} id={fieldId} className={styles.input} value={name} maxLength={100} placeholder="Playlist name" autoComplete="off" onChange={(event) => setName(event.currentTarget.value)} />
          <Button type="submit" disabled={working || name.trim() === ''}>
            {creating ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </form>

      <p className={styles.live} role="status">
        {message}
      </p>
    </div>
  )
}
