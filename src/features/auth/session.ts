import { getConfigIssues, sanitizeReturnTo } from './config.ts'
import { AuthRequiredError, authErrors } from './errors.ts'
import { createCodeChallenge, createCodeVerifier, createState, safeEqual } from './pkce.ts'
import { fetchProfile as defaultFetchProfile, type ProfileResult } from './profile.ts'
import { findMissingScopes } from './scopes.ts'
import { ATTEMPT_TTL_MS, type AttemptStore, type CredentialStore } from './storage.ts'
import { buildAuthorizeUrl, exchangeAuthorizationCode, isTerminalRefreshError, refreshAccessToken, type TokenGrant } from './tokenClient.ts'
import type { AuthConfig, AuthError, AuthNotice, AuthSnapshot, AuthStatus, CallbackResult, ProfileStatus, SpotifyProfile } from './types.ts'

/** Name of the cross-tab lock that serializes refresh-token use. */
export const REFRESH_LOCK = 'orchid.spotify.refresh'

/** Refresh slightly early so a token never expires mid-request. Our own margin, capped at half the token's lifetime. */
const EXPIRY_MARGIN_MS = 60_000

export interface SessionDeps {
  config: AuthConfig
  /** Scopes the enabled features need. */
  requiredScopes: readonly string[]
  fetch: typeof fetch
  credentials: CredentialStore
  attempts: AttemptStore
  /** Sends the browser to Spotify's consent page. */
  navigate: (url: string) => void
  now: () => number
  /** Origin the app is currently open at, used to catch redirect-URI mismatches before leaving the page. */
  currentOrigin: () => string | undefined
  /** Runs `task` while holding a lock that excludes other tabs. Falls back to just running it where Web Locks is missing. */
  withLock: <T>(name: string, task: () => Promise<T>) => Promise<T>
  crypto?: Pick<Crypto, 'getRandomValues' | 'subtle'>
  fetchProfile?: typeof defaultFetchProfile
}

export interface SpotifySession {
  getSnapshot(): AuthSnapshot
  subscribe(listener: () => void): () => void
  /** Restores a saved session if there is one. Safe to call repeatedly. */
  initialize(): Promise<void>
  /** Starts the redirect to Spotify. Resolves once the browser has been sent (or the attempt failed; see `error`). */
  login(returnTo?: string): Promise<void>
  /** Processes the redirect back from Spotify. Calling it again with the same query string returns the same result. */
  handleCallback(search: string): Promise<CallbackResult>
  /** A valid access token, refreshing first if needed. Rejects with `AuthRequiredError` when there is no session. */
  getAccessToken(): Promise<string>
  /** Call after a 401: forgets the cached access token so the next `getAccessToken` refreshes. */
  invalidateAccessToken(): void
  logout(): void
  retryProfile(): Promise<void>
  retryRestore(): Promise<void>
  dismissError(): void
  /** Wire to the window `storage` event, so sign-in and sign-out propagate between tabs. */
  handleExternalStorageChange(): void
  /** Wire to `pageshow` with `persisted`, for when Back returns from Spotify via the bfcache. */
  handlePageRestored(): void
}

interface TokenState {
  accessToken: string
  expiresAt: number
  lifetimeMs: number
}

export function createSpotifySession(deps: SessionDeps): SpotifySession {
  const { config, credentials, attempts } = deps
  const fetchProfile = deps.fetchProfile ?? defaultFetchProfile

  // --- state -------------------------------------------------------------------------------
  // The access token lives here and nowhere else.
  let tokens: TokenState | null = null
  /** Bumped whenever the session is replaced or ended. Async work started under an older value must not touch state. */
  let generation = 0
  let refreshInFlight: Promise<string> | null = null
  let initPromise: Promise<void> | null = null
  const callbackResults = new Map<string, Promise<CallbackResult>>()
  let noticeCounter = 0
  let statusBeforeRedirect: AuthStatus = 'signed-out'

  let core = {
    status: (credentials.read() ? 'restoring' : 'signed-out') as AuthStatus,
    error: null as AuthError | null,
    profile: null as SpotifyProfile | null,
    profileStatus: 'idle' as ProfileStatus,
    profileMessage: null as string | null,
    grantedScopes: [] as readonly string[],
    notice: null as AuthNotice | null,
  }
  let snapshot = buildSnapshot()
  const listeners = new Set<() => void>()

  function buildSnapshot(): AuthSnapshot {
    return {
      ...core,
      missingScopes: core.status === 'signed-in' ? findMissingScopes(deps.requiredScopes, core.grantedScopes) : [],
      hasStoredSession: credentials.read() !== null,
    }
  }

  function setState(patch: Partial<typeof core>) {
    core = { ...core, ...patch }
    snapshot = buildSnapshot()
    for (const listener of [...listeners]) listener()
  }

  const notice = (tone: AuthNotice['tone'], message: string): AuthNotice => ({ id: ++noticeCounter, tone, message })

  const signedOutPatch = {
    status: 'signed-out' as AuthStatus,
    profile: null,
    profileStatus: 'idle' as ProfileStatus,
    profileMessage: null,
    grantedScopes: [] as readonly string[],
  }

  /** Ends the in-memory session. Callers decide separately whether the stored credentials go too. */
  function endSession(patch: Partial<typeof core> = {}) {
    generation++
    tokens = null
    refreshInFlight = null
    setState({ ...signedOutPatch, ...patch })
  }

  // --- tokens ------------------------------------------------------------------------------
  const isFresh = (token: TokenState) => deps.now() < token.expiresAt - Math.min(EXPIRY_MARGIN_MS, token.lifetimeMs / 2)

  /**
   * Persists a refresh result, then (only if this session is still the current one) applies it to memory.
   * Persisting comes first and is a compare-and-set against the token we used: if the user logged out or
   * signed in again in the meantime, it is a no-op, but a rotated token is never lost to a superseded refresh.
   */
  function applyGrant(grant: TokenGrant, used: { refreshToken: string; clientId: string; scopes: string[] }, gen: number): string {
    // Use what Spotify says was granted. If a refresh response omits `scope`, keep what we already knew.
    const scopes = grant.scopes ?? used.scopes
    // Refresh tokens may rotate. If none is returned, the existing one stays valid.
    credentials.replaceIfCurrent(used.refreshToken, { v: 1, clientId: used.clientId, refreshToken: grant.refreshToken ?? used.refreshToken, scopes })
    if (gen !== generation) throw new AuthRequiredError(authErrors.sessionEnded())
    const lifetimeMs = grant.expiresInSeconds * 1000
    tokens = { accessToken: grant.accessToken, expiresAt: deps.now() + lifetimeMs, lifetimeMs }
    setState({ status: 'signed-in', error: null, grantedScopes: scopes })
    return grant.accessToken
  }

  async function doRefresh(gen: number): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt++) {
      // Read inside the lock: another tab may have rotated the token since we decided to refresh.
      const stored = credentials.read()
      if (!stored || stored.clientId !== config.clientId) {
        if (gen === generation) endSession({ error: authErrors.notConnected() })
        throw new AuthRequiredError(authErrors.notConnected())
      }

      const result = await refreshAccessToken({ config, refreshToken: stored.refreshToken, fetch: deps.fetch })
      if (result.ok) return applyGrant(result.grant, stored, gen)
      if (gen !== generation) throw new AuthRequiredError(authErrors.sessionEnded()) // signed out or replaced while waiting

      if (result.kind === 'rejected' && isTerminalRefreshError(result.oauthError)) {
        // If another tab stored a newer token while we were asking, the failure was about the old one. Try the new one once.
        const latest = credentials.read()
        if (attempt === 0 && latest && latest.refreshToken !== stored.refreshToken) continue
        credentials.clearIfCurrent(stored.refreshToken)
        const error = authErrors.sessionExpired()
        endSession({ error, notice: notice('warning', error.message) })
        throw new AuthRequiredError(error)
      }

      // Anything else leaves the saved session alone: it may work later, and signing in again always replaces it.
      const error = result.kind === 'rejected' ? authErrors.restoreRejected(result.oauthError) : result.kind === 'malformed' ? authErrors.exchangeMalformed() : authErrors.network()
      setState({ error, ...(core.status === 'restoring' ? { status: 'signed-out' as const } : {}) })
      throw new AuthRequiredError(error)
    }
    throw new AuthRequiredError(authErrors.sessionEnded())
  }

  /** One refresh at a time in this tab (shared promise) and across tabs (lock), so rotated tokens cannot race. */
  function refresh(): Promise<string> {
    if (refreshInFlight) return refreshInFlight
    const gen = generation
    const run = deps.withLock(REFRESH_LOCK, () => doRefresh(gen)).finally(() => {
      if (refreshInFlight === run) refreshInFlight = null
    })
    refreshInFlight = run
    return run
  }

  async function getAccessToken(): Promise<string> {
    if (tokens && isFresh(tokens)) return tokens.accessToken
    if (!credentials.read()) {
      // No refresh token (Spotify did not issue one, or it was cleared). The access token is spent, so the session is over.
      if (tokens || core.status === 'signed-in') {
        const error = authErrors.sessionExpired()
        endSession({ error, notice: notice('warning', error.message) })
      }
      throw new AuthRequiredError(authErrors.notConnected())
    }
    return refresh()
  }

  // --- profile -----------------------------------------------------------------------------
  async function loadProfile(gen: number): Promise<void> {
    if (gen !== generation) return
    setState({ profileStatus: 'loading', profileMessage: null })
    const result: ProfileResult = await fetchProfile({
      apiBaseUrl: config.apiBaseUrl,
      getAccessToken,
      invalidateAccessToken,
      fetch: deps.fetch,
    })
    if (gen !== generation) return
    switch (result.status) {
      case 'ready':
        setState({ profile: result.profile, profileStatus: 'ready', profileMessage: null })
        break
      case 'restricted':
        setState({ profile: null, profileStatus: 'restricted', profileMessage: result.message })
        break
      case 'error':
        setState({ profile: null, profileStatus: 'error', profileMessage: result.message })
        break
      case 'unauthenticated':
        break // the session layer already handled it
    }
  }

  function invalidateAccessToken() {
    tokens = null
  }

  // --- restore -----------------------------------------------------------------------------
  async function restoreSavedSession(): Promise<void> {
    const stored = credentials.read()
    if (!stored) {
      if (core.status === 'restoring') setState(signedOutPatch)
      return
    }
    if (stored.clientId !== config.clientId) {
      credentials.clear() // issued to a different app: useless here
      setState(signedOutPatch)
      return
    }
    const gen = ++generation
    refreshInFlight = null // never adopt a refresh that belongs to an older generation
    setState({ status: 'restoring', error: null })
    try {
      await refresh()
    } catch {
      return // refresh() has already put the failure into state
    }
    if (gen === generation) void loadProfile(gen)
  }

  function initialize(): Promise<void> {
    // On the callback route the page's effect runs before the provider's, so a sign-in may already be underway.
    // Restoring now would race it; the callback restores a saved session itself if it fails.
    initPromise ??= core.status === 'exchanging' || core.status === 'redirecting' ? Promise.resolve() : restoreSavedSession()
    return initPromise
  }

  // --- login -------------------------------------------------------------------------------
  async function login(returnTo?: string): Promise<void> {
    if (core.status === 'redirecting' || core.status === 'exchanging') return

    const issues = getConfigIssues(config, deps.currentOrigin())
    if (issues.length > 0) {
      setState({ error: authErrors.notConfigured(issues[0].message) })
      return
    }

    try {
      const verifier = createCodeVerifier(deps.crypto)
      const state = createState(deps.crypto)
      const challenge = await createCodeChallenge(verifier, deps.crypto)
      const saved = attempts.save({ v: 1, state, verifier, returnTo: sanitizeReturnTo(returnTo), createdAt: deps.now() })
      if (!saved) {
        setState({ error: authErrors.storageBlocked() })
        return
      }
      statusBeforeRedirect = core.status
      setState({ status: 'redirecting', error: null })
      deps.navigate(buildAuthorizeUrl({ config, scopes: deps.requiredScopes, state, challenge }))
    } catch {
      attempts.clear()
      setState({ error: authErrors.providerError(null) })
    }
  }

  // --- callback ----------------------------------------------------------------------------
  async function processCallback(search: string): Promise<CallbackResult> {
    const gen = ++generation // anything still in flight from before this callback must not land on top of it
    refreshInFlight = null
    setState({ status: 'exchanging', error: null })

    const attempt = attempts.take() // one-time use, whatever the outcome
    const returnTo = sanitizeReturnTo(attempt?.returnTo)

    const fail = (error: AuthError): CallbackResult => {
      if (gen === generation) {
        if (tokens) {
          setState({ status: 'signed-in' }) // already signed in (e.g. a replayed link): nothing changes
        } else {
          // Nothing was signed in. If a saved session exists, bring it back instead of leaving the user signed out.
          setState({ status: 'signed-out' })
          void restoreSavedSession()
        }
      }
      return { ok: false, error, returnTo }
    }

    const issues = getConfigIssues(config, deps.currentOrigin())
    if (issues.length > 0) return fail(authErrors.notConfigured(issues[0].message))
    if (!attempt) return fail(authErrors.noAttempt())
    if (deps.now() - attempt.createdAt > ATTEMPT_TTL_MS) return fail(authErrors.attemptExpired())

    const params = new URLSearchParams(search)
    const state = params.get('state')
    if (!state || !safeEqual(state, attempt.state)) return fail(authErrors.stateMismatch())

    const providerError = params.get('error')
    if (providerError) {
      return fail(providerError === 'access_denied' ? authErrors.accessDenied() : authErrors.providerError(/^[a-z_]{1,64}$/.test(providerError) ? providerError : null))
    }

    const code = params.get('code')
    if (!code) return fail(authErrors.missingCode())

    const result = await exchangeAuthorizationCode({ config, code, verifier: attempt.verifier, fetch: deps.fetch })
    if (gen !== generation) return { ok: false, error: authErrors.sessionEnded(), returnTo } // signed out mid-exchange
    if (!result.ok) {
      return fail(result.kind === 'rejected' ? authErrors.exchangeRejected(result.oauthError) : result.kind === 'malformed' ? authErrors.exchangeMalformed() : authErrors.network())
    }

    const { grant } = result
    const lifetimeMs = grant.expiresInSeconds * 1000
    // Do not assume scopes: if Spotify did not say, treat nothing as granted so scope checks fail closed.
    const scopes = grant.scopes ?? []
    tokens = { accessToken: grant.accessToken, expiresAt: deps.now() + lifetimeMs, lifetimeMs }

    if (grant.refreshToken) {
      credentials.write({ v: 1, clientId: config.clientId, refreshToken: grant.refreshToken, scopes })
    } else {
      // No refresh token was issued, so this session cannot outlive the access token. Drop any older saved session.
      credentials.clear()
    }

    setState({
      status: 'signed-in',
      error: null,
      grantedScopes: scopes,
      profile: null,
      profileStatus: 'idle',
      profileMessage: null,
      notice: notice('info', 'Spotify sign-in complete.'),
    })
    void loadProfile(gen)
    return { ok: true, returnTo }
  }

  function handleCallback(search: string): Promise<CallbackResult> {
    // React StrictMode runs effects twice in development. Without this, the second run would find the one-time attempt gone.
    let pending = callbackResults.get(search)
    if (!pending) {
      pending = processCallback(search)
      callbackResults.set(search, pending)
    }
    return pending
  }

  // --- logout & cross-tab ------------------------------------------------------------------
  function logout() {
    credentials.clear()
    attempts.clear()
    callbackResults.clear()
    endSession({ error: null, notice: notice('info', 'Disconnected from Spotify on this device.') })
  }

  function handleExternalStorageChange() {
    if (core.status === 'redirecting' || core.status === 'exchanging') return
    const stored = credentials.read()
    if (!stored && (core.status === 'signed-in' || core.status === 'restoring')) {
      endSession({ error: null, notice: notice('info', 'You were signed out of Spotify in another tab.') })
    } else if (stored && core.status === 'signed-out') {
      void restoreSavedSession()
    }
  }

  function handlePageRestored() {
    if (core.status !== 'redirecting') return
    attempts.clear()
    setState({ status: statusBeforeRedirect === 'signed-in' && tokens ? 'signed-in' : 'signed-out' })
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    initialize,
    login,
    handleCallback,
    getAccessToken,
    invalidateAccessToken,
    logout,
    retryProfile: async () => {
      if (core.status === 'signed-in') await loadProfile(generation)
    },
    retryRestore: () => restoreSavedSession(),
    dismissError: () => setState({ error: null }),
    handleExternalStorageChange,
    handlePageRestored,
  }
}
