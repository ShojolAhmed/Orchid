import { useMemo } from 'react'
import { spotifyConfig } from '../../config/spotify'
import { evaluateAccess, type Access } from './access'
import { useAuth } from './AuthContext'
import type { FeatureId } from './scopes'

/** Access to one or more features for the current session. The result is stable between renders. */
export function useFeatureAccess(...features: FeatureId[]): Access {
  const { state } = useAuth()
  const key = features.join(',')
  const configured = Boolean(spotifyConfig.clientId)
  return useMemo(() => evaluateAccess(state.status, state.grantedScopes, key.split(',') as FeatureId[], configured), [state.status, state.grantedScopes, key, configured])
}

/** The signed-in account's id, once the profile has loaded. Null otherwise. */
export function useViewerId(): string | null {
  return useAuth().state.profile?.id ?? null
}

/**
 * True once the profile request has finished one way or the other (loaded, restricted or failed). Code that needs
 * to know "is this mine?" waits for this instead of guessing while the id is still unknown.
 */
export function useProfileSettled(): boolean {
  const status = useAuth().state.profileStatus
  return status === 'ready' || status === 'restricted' || status === 'error'
}
