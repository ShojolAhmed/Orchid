import { spotifyConfig } from '../../config/spotify'
import { REQUIRED_SCOPES } from './scopes'
import { createSpotifySession, type SessionDeps, type SpotifySession } from './session'
import { createAttemptStore, createCredentialStore, type KeyValueStorage } from './storage'

/** `window.localStorage` itself can throw (blocked site data), so access is lazy and guarded per call. */
function browserStorage(kind: 'localStorage' | 'sessionStorage'): KeyValueStorage {
  return {
    getItem: (key) => window[kind].getItem(key),
    setItem: (key, value) => window[kind].setItem(key, value),
    removeItem: (key) => window[kind].removeItem(key),
  }
}

/** Web Locks makes refreshes mutually exclusive across tabs. Where it is missing, tabs fall back to the in-tab single-flight only. */
const withLock: SessionDeps['withLock'] = (name, task) => (typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request(name, task) : task())

let instance: SpotifySession | undefined

/** The one session for this page. Created lazily so tests and tooling can import the feature without a browser. */
export function getSpotifySession(): SpotifySession {
  instance ??= createSpotifySession({
    config: spotifyConfig,
    requiredScopes: REQUIRED_SCOPES,
    fetch: (input, init) => fetch(input, init),
    credentials: createCredentialStore(browserStorage('localStorage')),
    attempts: createAttemptStore(browserStorage('sessionStorage')),
    navigate: (url) => window.location.assign(url),
    now: () => Date.now(),
    currentOrigin: () => window.location.origin,
    withLock,
  })
  return instance
}
