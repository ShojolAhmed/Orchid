import { useCallback } from 'react'
import { useFeatureAccess } from '../auth'
import { usePlayer } from '../player'
import { useSaved, type SavedState } from './useSaved'

export interface SavedActions extends SavedState {
  /** The session may read and change the library, and the lookup has not failed. */
  available: boolean
  /** Flips one item and tells the person what happened, using Spotify's real answer. */
  toggleWithNotice: (uri: string, title: string) => void
}

/** Saved-state for a list of tracks/albums plus a toggle that reports success or failure. */
export function useSavedActions(uris: readonly string[]): SavedActions {
  const access = useFeatureAccess('library')
  const granted = access.status === 'granted'
  const saved = useSaved(uris, granted)
  const { actions } = usePlayer()
  const notify = actions.notify
  const toggle = saved.toggle

  const toggleWithNotice = useCallback(
    (uri: string, title: string) => {
      toggle(uri).then(
        (now) => notify(now ? `Saved “${title}” to Your Library` : `Removed “${title}” from Your Library`),
        (error: unknown) => notify(error instanceof Error ? error.message : 'Could not update Your Library. Try again.'),
      )
    },
    [toggle, notify],
  )

  return { ...saved, available: granted && !saved.lookupFailed, toggleWithNotice }
}
