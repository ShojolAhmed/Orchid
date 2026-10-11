import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { savedStore } from './savedItems'

export interface SavedState {
  /** `undefined` means Spotify has not answered yet (or the lookup failed), which is different from "not saved". */
  isSaved: (uri: string | undefined) => boolean | undefined
  isPending: (uri: string | undefined) => boolean
  lookupFailed: boolean
  /** Rejects when Spotify refused or could not be reached. The caller says so; nothing is changed on screen. */
  toggle: (uri: string) => Promise<boolean>
}

/** Subscribes to the saved-items store and asks Spotify about `uris` while `enabled`. */
export function useSaved(uris: readonly string[], enabled: boolean): SavedState {
  const snapshot = useSyncExternalStore(savedStore.subscribe, savedStore.getSnapshot, savedStore.getSnapshot)
  const joined = uris.join('|')

  useEffect(() => {
    if (enabled && joined) savedStore.request(joined.split('|'))
  }, [enabled, joined])

  const isSaved = useCallback((uri: string | undefined) => (uri ? snapshot.saved.get(uri) : undefined), [snapshot])
  const isPending = useCallback((uri: string | undefined) => (uri ? snapshot.pending.has(uri) : false), [snapshot])
  return { isSaved, isPending, lookupFailed: snapshot.lookupFailed, toggle: savedStore.toggle }
}
