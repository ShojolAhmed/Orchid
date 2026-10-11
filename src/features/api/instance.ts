import { spotifyConfig } from '../../config/spotify'
import { getSpotifySession } from '../auth/instance'
import { createSpotifyClient, type SpotifyClient } from './client'
import { createSpotifyEndpoints, type SpotifyEndpoints } from './endpoints'

/**
 * The one client for this page, wired to the real session and `fetch`. Created lazily so tests can import
 * the framework-free modules without a browser.
 */

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const timer = window.setTimeout(done, ms)
    function done() {
      window.clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    signal?.addEventListener('abort', done, { once: true })
  })
}

let client: SpotifyClient | undefined
let endpoints: SpotifyEndpoints | undefined
let watching = false

/** Drops cached data when the account changes or ends, so one account never sees another's data. */
function watchAccount(target: SpotifyClient, onReset: () => void) {
  if (watching) return
  watching = true
  const session = getSpotifySession()
  let lastKey = ''
  session.subscribe(() => {
    const snapshot = session.getSnapshot()
    const key = snapshot.status === 'signed-in' ? `in:${snapshot.profile?.id ?? ''}` : snapshot.status === 'signed-out' ? 'out' : lastKey
    if (key !== lastKey) {
      // Going from "signed in, profile not loaded yet" to the real profile is not an account change.
      const profileArrived = lastKey === 'in:' && key.startsWith('in:') && key.length > 3
      if (lastKey !== '' && !profileArrived) {
        target.reset()
        onReset()
      }
      lastKey = key
    }
  })
}

const resetListeners = new Set<() => void>()

/** Called when the signed-in account changes or ends. The saved-items store registers here. */
export function onAccountReset(listener: () => void): () => void {
  resetListeners.add(listener)
  return () => resetListeners.delete(listener)
}

export function getSpotifyClient(): SpotifyClient {
  if (!client) {
    const session = getSpotifySession()
    client = createSpotifyClient({
      apiBaseUrl: spotifyConfig.apiBaseUrl,
      getToken: () => session.getAccessToken(),
      invalidateToken: () => session.invalidateAccessToken(),
      fetch: (input, init) => fetch(input, init),
      sleep,
      now: () => Date.now(),
    })
    watchAccount(client, () => resetListeners.forEach((listener) => listener()))
  }
  return client
}

export function getSpotifyEndpoints(): SpotifyEndpoints {
  endpoints ??= createSpotifyEndpoints(getSpotifyClient())
  return endpoints
}
