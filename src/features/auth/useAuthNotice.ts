import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext'

/** The latest auth notice ("Connected to Spotify.", "Session expired") as text for a toast, hidden again after `durationMs`. */
export function useAuthNotice(durationMs = 4500): string | null {
  const { state } = useAuth()
  const [dismissedId, setDismissedId] = useState<number | null>(null)
  const id = state.notice?.id

  useEffect(() => {
    if (id === undefined) return
    const timer = window.setTimeout(() => setDismissedId(id), durationMs)
    return () => window.clearTimeout(timer)
  }, [id, durationMs])

  return state.notice && state.notice.id !== dismissedId ? state.notice.message : null
}
