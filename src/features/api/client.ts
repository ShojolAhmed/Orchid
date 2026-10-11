import { AuthRequiredError } from '../auth/errors.ts'
import { SpotifyApiError } from './errors.ts'

/**
 * The single place that talks to `api.spotify.com`. Everything else (catalog service, library, search)
 * calls this and gets typed errors back. Framework-free and dependency-injected so it runs in Node tests.
 *
 * Rules it enforces:
 * - Authorization failures (401) refresh the token once; a second 401 is `unauthorized`. Never a loop.
 * - 429: `QUOTA_EXCEEDED` is never retried. A short Retry-After is waited out once; a long one is
 *   reported. After any 429 the client refuses to send requests until the cooldown ends.
 * - 5xx: one retry, GET only. Writes are never retried (a repeated POST could create twice).
 * - Identical GETs in flight share one request; successful GETs are cached briefly. A cached response is
 *   shared between callers and must be treated as read-only.
 * - A caller's AbortSignal cancels its own wait, and cancels the network request once nobody wants it.
 * - Any write clears the cache so the next read is fresh. `reset()` (sign-out, account change) drops
 *   everything so one account never sees another's data.
 */

export type QueryValue = string | number | boolean | undefined
export type Query = Readonly<Record<string, QueryValue>>

export interface ClientDeps {
  /** e.g. https://api.spotify.com/v1 */
  apiBaseUrl: string
  getToken: () => Promise<string>
  invalidateToken: () => void
  fetch: (input: string, init: RequestInit) => Promise<Response>
  /** Resolves after `ms`, or as soon as `signal` aborts. */
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>
  now: () => number
  /** How long a successful GET may be reused. Default 30 s. */
  cacheTtlMs?: number
  /** Longest Retry-After the client will sit through before retrying once. Default 3 s. */
  maxRetryWaitMs?: number
  serverRetryDelayMs?: number
  /** How long to refuse requests after `QUOTA_EXCEEDED`. Default 30 s. */
  quotaCooldownMs?: number
}

export interface ReadOptions {
  query?: Query
  signal?: AbortSignal
  /** Skip the cache (a Retry button should show current data). In-flight sharing still applies. */
  fresh?: boolean
}

export interface WriteOptions {
  query?: Query
  body?: unknown
  signal?: AbortSignal
}

export interface SpotifyClient {
  get<T>(path: string, options?: ReadOptions): Promise<T>
  post<T = void>(path: string, options?: WriteOptions): Promise<T>
  put<T = void>(path: string, options?: WriteOptions): Promise<T>
  delete<T = void>(path: string, options?: WriteOptions): Promise<T>
  clearCache(): void
  reset(): void
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface Flight {
  url: string
  promise: Promise<unknown>
  controller: AbortController
  waiters: number
}

const MAX_CACHE_ENTRIES = 200

function buildUrl(base: string, path: string, query?: Query): string {
  const params = new URLSearchParams()
  for (const key of Object.keys(query ?? {}).sort()) {
    const value = query?.[key]
    if (value !== undefined) params.set(key, String(value))
  }
  const text = params.toString()
  return `${base}${path}${text ? `?${text}` : ''}`
}

/** Spotify's error bodies: `{ error: { status, message, reason? } }`, or OAuth style `{ error: "..." }`. Best effort. */
async function readReason(response: Response): Promise<string | null> {
  try {
    const parsed: unknown = JSON.parse(await response.text())
    if (typeof parsed !== 'object' || parsed === null || !('error' in parsed)) return null
    const error = (parsed as { error?: unknown }).error
    if (typeof error === 'string') return error.slice(0, 120)
    if (typeof error === 'object' && error !== null) {
      const { reason, message } = error as { reason?: unknown; message?: unknown }
      if (typeof reason === 'string') return reason.slice(0, 120)
      if (typeof message === 'string') return message.slice(0, 120)
    }
  } catch {
    // no body, or not JSON
  }
  return null
}

function readRetryAfter(response: Response): number | null {
  const value = Number(response.headers.get('Retry-After'))
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : null
}

export function createSpotifyClient(deps: ClientDeps): SpotifyClient {
  const ttl = deps.cacheTtlMs ?? 30_000
  const maxRetryWaitMs = deps.maxRetryWaitMs ?? 3_000
  const serverRetryDelayMs = deps.serverRetryDelayMs ?? 600
  const quotaCooldownMs = deps.quotaCooldownMs ?? 30_000

  const cache = new Map<string, { value: unknown; expires: number }>()
  const flights = new Map<string, Flight>()
  let cooldownUntil = 0
  let epoch = 0

  async function token(): Promise<string> {
    try {
      return await deps.getToken()
    } catch (error) {
      if (error instanceof AuthRequiredError) throw new SpotifyApiError('signed-out')
      throw new SpotifyApiError('network')
    }
  }

  function parseBody(text: string): unknown {
    if (!text) return undefined
    try {
      return JSON.parse(text)
    } catch {
      throw new SpotifyApiError('malformed')
    }
  }

  async function execute(method: Method, url: string, body: unknown, signal: AbortSignal): Promise<unknown> {
    let authRetried = false
    let rateRetried = false
    let serverRetried = false

    for (;;) {
      if (signal.aborted) throw new SpotifyApiError('aborted')
      const remaining = cooldownUntil - deps.now()
      if (remaining > 0) throw new SpotifyApiError('rate-limited', 429, null, Math.ceil(remaining / 1000))

      const accessToken = await token()
      if (signal.aborted) throw new SpotifyApiError('aborted')

      const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` }
      let payload: string | undefined
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json'
        payload = JSON.stringify(body)
      }

      let response: Response
      try {
        response = await deps.fetch(url, { method, headers, signal, ...(payload === undefined ? {} : { body: payload }) })
      } catch {
        if (signal.aborted) throw new SpotifyApiError('aborted')
        throw new SpotifyApiError('network')
      }

      if (response.ok) {
        try {
          return parseBody(await response.text())
        } catch (error) {
          if (error instanceof SpotifyApiError) throw error
          if (signal.aborted) throw new SpotifyApiError('aborted')
          throw new SpotifyApiError('network')
        }
      }

      const status = response.status

      if (status === 401) {
        if (authRetried) throw new SpotifyApiError('unauthorized', 401)
        authRetried = true
        deps.invalidateToken()
        continue
      }

      if (status === 429) {
        const reason = await readReason(response)
        const seconds = readRetryAfter(response)
        if (reason === 'QUOTA_EXCEEDED') {
          cooldownUntil = deps.now() + quotaCooldownMs
          throw new SpotifyApiError('quota-exceeded', 429, reason)
        }
        const waitMs = (seconds ?? 1) * 1000
        cooldownUntil = deps.now() + waitMs
        if (!rateRetried && waitMs <= maxRetryWaitMs) {
          rateRetried = true
          await deps.sleep(waitMs, signal)
          cooldownUntil = Math.min(cooldownUntil, deps.now())
          continue
        }
        throw new SpotifyApiError('rate-limited', 429, reason, seconds)
      }

      if (status >= 500) {
        if (method === 'GET' && !serverRetried) {
          serverRetried = true
          await deps.sleep(serverRetryDelayMs, signal)
          continue
        }
        throw new SpotifyApiError('server', status)
      }

      const reason = await readReason(response)
      if (status === 403) throw new SpotifyApiError('forbidden', status, reason)
      if (status === 404) throw new SpotifyApiError('not-found', status, reason)
      throw new SpotifyApiError('bad-request', status, reason)
    }
  }

  /** Waits for a shared flight on behalf of one caller. The request is cancelled when its last caller leaves. */
  function join<T>(flight: Flight, signal: AbortSignal | undefined): Promise<T> {
    flight.waiters += 1
    return new Promise<T>((resolve, reject) => {
      let settled = false
      const leave = () => {
        flight.waiters -= 1
        signal?.removeEventListener('abort', onAbort)
      }
      function onAbort() {
        if (settled) return
        settled = true
        leave()
        if (flight.waiters === 0) {
          if (flights.get(flight.url) === flight) flights.delete(flight.url)
          flight.controller.abort()
        }
        reject(new SpotifyApiError('aborted'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      flight.promise.then(
        (value) => {
          if (settled) return
          settled = true
          leave()
          resolve(value as T)
        },
        (error: unknown) => {
          if (settled) return
          settled = true
          leave()
          reject(error)
        },
      )
    })
  }

  function get<T>(path: string, options: ReadOptions = {}): Promise<T> {
    const { query, signal, fresh } = options
    if (signal?.aborted) return Promise.reject(new SpotifyApiError('aborted'))
    const url = buildUrl(deps.apiBaseUrl, path, query)

    if (!fresh) {
      const hit = cache.get(url)
      if (hit && hit.expires > deps.now()) return Promise.resolve(hit.value as T)
      if (hit) cache.delete(url)
    }

    let flight = flights.get(url)
    if (!flight) {
      const controller = new AbortController()
      const startedIn = epoch
      const promise = execute('GET', url, undefined, controller.signal).then((value) => {
        if (startedIn === epoch && value !== undefined) {
          cache.set(url, { value, expires: deps.now() + ttl })
          if (cache.size > MAX_CACHE_ENTRIES) {
            const oldest = cache.keys().next().value
            if (oldest !== undefined) cache.delete(oldest)
          }
        }
        return value
      })
      const created: Flight = { url, promise, controller, waiters: 0 }
      flights.set(url, created)
      const cleanup = () => {
        if (flights.get(url) === created) flights.delete(url)
      }
      promise.then(cleanup, cleanup)
      flight = created
    }
    return join<T>(flight, signal)
  }

  async function send<T>(method: Exclude<Method, 'GET'>, path: string, options: WriteOptions = {}): Promise<T> {
    const { query, body, signal } = options
    if (signal?.aborted) throw new SpotifyApiError('aborted')
    const controller = new AbortController()
    const forward = () => controller.abort()
    signal?.addEventListener('abort', forward, { once: true })
    try {
      const value = await execute(method, buildUrl(deps.apiBaseUrl, path, query), body, controller.signal)
      // Whatever was cached about the user's library or playlists may now be wrong.
      cache.clear()
      return value as T
    } finally {
      signal?.removeEventListener('abort', forward)
    }
  }

  return {
    get,
    post: (path, options) => send('POST', path, options),
    put: (path, options) => send('PUT', path, options),
    delete: (path, options) => send('DELETE', path, options),
    clearCache: () => cache.clear(),
    reset() {
      epoch += 1
      cache.clear()
      cooldownUntil = 0
      for (const flight of flights.values()) flight.controller.abort()
      flights.clear()
    },
  }
}
