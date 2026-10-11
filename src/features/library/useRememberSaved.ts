import { useEffect } from 'react'
import { savedStore } from './savedItems'

/** Tells the saved-items store that these URIs are in the library because they came from the library list itself. */
export function useRememberSaved(uris: readonly string[]) {
  const joined = uris.join('|')
  useEffect(() => {
    if (joined) savedStore.remember(joined.split('|'), true)
  }, [joined])
}
