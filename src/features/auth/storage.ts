/**
 * Where credentials live, and why.
 *
 * - Access token: memory only (see session.ts). Never written anywhere.
 * - Refresh token: `localStorage`. A single-page app has no other way to survive a reload or
 *   a new tab without asking the user to sign in again. Any script running on this origin can
 *   read it (XSS), so the app ships no third-party scripts, and the record holds nothing else
 *   sensitive. Spotify's own browser example persists tokens in `localStorage` too.
 * - PKCE verifier and `state`: `sessionStorage`, per tab, for the few seconds between leaving
 *   for Spotify and coming back. Read-and-deleted on first use, with a short expiry.
 *
 * Storage can throw (disabled, quota, some private modes). Every call here treats that as
 * "nothing stored" rather than crashing the app.
 */

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const CREDENTIALS_KEY = 'orchid.spotify.credentials.v1'
export const ATTEMPT_KEY = 'orchid.spotify.sign-in-attempt.v1'

/** How long a sign-in attempt stays valid after leaving for Spotify. Our own limit, not Spotify's. */
export const ATTEMPT_TTL_MS = 10 * 60 * 1000

export interface StoredCredentials {
  v: 1
  /** Client the token was issued to. A token for another client ID is useless and is discarded. */
  clientId: string
  refreshToken: string
  scopes: string[]
}

export interface SignInAttempt {
  v: 1
  state: string
  verifier: string
  returnTo: string
  createdAt: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export interface CredentialStore {
  read(): StoredCredentials | null
  write(credentials: StoredCredentials): boolean
  /** Writes only if the stored refresh token is still `expected`, so a slow refresh cannot overwrite a newer sign-in. */
  replaceIfCurrent(expected: string, next: StoredCredentials): boolean
  clear(): void
  /** Clears only if the stored refresh token is still `expected`. Returns whether it cleared. */
  clearIfCurrent(expected: string): boolean
}

export function createCredentialStore(storage: KeyValueStorage): CredentialStore {
  const read = (): StoredCredentials | null => {
    let raw: string | null
    try {
      raw = storage.getItem(CREDENTIALS_KEY)
    } catch {
      return null
    }
    if (raw === null) return null
    try {
      const parsed: unknown = JSON.parse(raw)
      if (
        isRecord(parsed) &&
        parsed.v === 1 &&
        typeof parsed.clientId === 'string' &&
        typeof parsed.refreshToken === 'string' &&
        parsed.refreshToken.length > 0 &&
        Array.isArray(parsed.scopes) &&
        parsed.scopes.every((scope) => typeof scope === 'string')
      ) {
        return { v: 1, clientId: parsed.clientId, refreshToken: parsed.refreshToken, scopes: parsed.scopes as string[] }
      }
    } catch {
      // fall through: unreadable record
    }
    clear() // corrupt or from an unknown version: remove it instead of failing on every load
    return null
  }

  const write = (credentials: StoredCredentials): boolean => {
    try {
      storage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials))
      return true
    } catch {
      return false
    }
  }

  const clear = () => {
    try {
      storage.removeItem(CREDENTIALS_KEY)
    } catch {
      // nothing to do
    }
  }

  return {
    read,
    write,
    clear,
    replaceIfCurrent: (expected, next) => (read()?.refreshToken === expected ? write(next) : false),
    clearIfCurrent: (expected) => {
      if (read()?.refreshToken !== expected) return false
      clear()
      return true
    },
  }
}

export interface AttemptStore {
  save(attempt: SignInAttempt): boolean
  /** Returns the saved attempt and deletes it in the same step, so a callback can only ever be processed once. */
  take(): SignInAttempt | null
  clear(): void
}

export function createAttemptStore(storage: KeyValueStorage): AttemptStore {
  const clear = () => {
    try {
      storage.removeItem(ATTEMPT_KEY)
    } catch {
      // nothing to do
    }
  }
  return {
    clear,
    save(attempt) {
      try {
        storage.setItem(ATTEMPT_KEY, JSON.stringify(attempt))
        return true
      } catch {
        return false
      }
    },
    take() {
      let raw: string | null
      try {
        raw = storage.getItem(ATTEMPT_KEY)
      } catch {
        return null
      }
      clear()
      if (raw === null) return null
      try {
        const parsed: unknown = JSON.parse(raw)
        if (
          isRecord(parsed) &&
          parsed.v === 1 &&
          typeof parsed.state === 'string' &&
          typeof parsed.verifier === 'string' &&
          typeof parsed.returnTo === 'string' &&
          typeof parsed.createdAt === 'number'
        ) {
          return { v: 1, state: parsed.state, verifier: parsed.verifier, returnTo: parsed.returnTo, createdAt: parsed.createdAt }
        }
      } catch {
        // unreadable
      }
      return null
    },
  }
}
