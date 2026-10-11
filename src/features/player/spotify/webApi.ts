import { AuthRequiredError } from '../../auth/errors.ts'
import { playbackIssues, type PlaybackIssue } from './playbackIssues.ts'

/**
 * The few Web API calls that the Web Playback SDK cannot do for itself. The SDK controls its own device
 * (play, pause, seek, volume, next, previous). The Web API is needed for: starting a context or list of
 * tracks, transferring playback to this device, shuffle, repeat and adding to the queue. All are
 * "Player" endpoints that need the `user-modify-playback-state` scope and Premium. They still exist for
 * development-mode apps (Spotify's February 2026 changelog).
 */

export type RepeatApiState = 'off' | 'context' | 'track'

export interface StartPlaybackBody {
  context_uri?: string
  uris?: string[]
  offset?: { position: number } | { uri: string }
  position_ms?: number
}

export class PlaybackApiError extends Error {
  readonly issue: PlaybackIssue
  readonly status: number | null
  readonly retryAfterSeconds: number | null

  constructor(issue: PlaybackIssue, status: number | null, retryAfterSeconds: number | null = null) {
    super(issue.message)
    this.name = 'PlaybackApiError'
    this.issue = issue
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export interface PlayerWebApiDeps {
  /** e.g. https://api.spotify.com/v1 */
  apiBaseUrl: string
  getToken: () => Promise<string>
  invalidateToken: () => void
  fetch: (input: string, init: RequestInit) => Promise<Response>
}

export interface PlayerWebApi {
  transfer(deviceId: string, play: boolean): Promise<void>
  play(body: StartPlaybackBody, deviceId: string): Promise<void>
  addToQueue(uri: string, deviceId: string): Promise<void>
  setShuffle(on: boolean, deviceId: string): Promise<void>
  setRepeat(state: RepeatApiState, deviceId: string): Promise<void>
}

interface RequestSpec {
  method: 'PUT' | 'POST'
  path: string
  query?: Record<string, string>
  body?: unknown
}

/** Spotify's player errors carry a `reason` (for example `PREMIUM_REQUIRED`). Best effort: fall back to the status. */
async function readReason(response: Response): Promise<string | null> {
  try {
    const parsed: unknown = await response.json()
    if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
      const error = (parsed as { error?: { reason?: unknown } }).error
      if (typeof error?.reason === 'string') return error.reason
    }
  } catch {
    // no body, or not JSON
  }
  return null
}

async function toError(response: Response): Promise<PlaybackApiError> {
  const status = response.status
  if (status === 401) return new PlaybackApiError(playbackIssues.authentication(), status)
  if (status === 403) {
    const reason = await readReason(response)
    return new PlaybackApiError(reason === 'PREMIUM_REQUIRED' ? playbackIssues.premiumRequired() : playbackIssues.restricted(), status)
  }
  if (status === 404) return new PlaybackApiError(playbackIssues.noDevice(), status)
  if (status === 429) {
    const header = Number(response.headers.get('Retry-After'))
    const seconds = Number.isFinite(header) && header > 0 ? Math.ceil(header) : null
    return new PlaybackApiError(playbackIssues.rateLimited(seconds ?? undefined), status, seconds)
  }
  if (status >= 500) return new PlaybackApiError(playbackIssues.service(), status)
  return new PlaybackApiError(playbackIssues.playbackFailed(`status ${status}`), status)
}

export function createPlayerWebApi(deps: PlayerWebApiDeps): PlayerWebApi {
  async function attempt(spec: RequestSpec, token: string): Promise<Response> {
    const query = spec.query ? `?${new URLSearchParams(spec.query).toString()}` : ''
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
    let body: string | undefined
    if (spec.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(spec.body)
    }
    try {
      return await deps.fetch(`${deps.apiBaseUrl}${spec.path}${query}`, { method: spec.method, headers, ...(body === undefined ? {} : { body }) })
    } catch {
      throw new PlaybackApiError(playbackIssues.network(), null)
    }
  }

  async function token(): Promise<string> {
    try {
      return await deps.getToken()
    } catch (error) {
      if (error instanceof AuthRequiredError) throw new PlaybackApiError(playbackIssues.signInRequired(), null)
      throw new PlaybackApiError(playbackIssues.network(), null)
    }
  }

  async function send(spec: RequestSpec): Promise<void> {
    let response = await attempt(spec, await token())
    if (response.status === 401) {
      // The cached token may have been revoked or expired early: drop it and try once with a fresh one.
      deps.invalidateToken()
      response = await attempt(spec, await token())
    }
    if (!response.ok) throw await toError(response)
  }

  return {
    transfer: (deviceId, play) => send({ method: 'PUT', path: '/me/player', body: { device_ids: [deviceId], play } }),
    play: (body, deviceId) => send({ method: 'PUT', path: '/me/player/play', query: { device_id: deviceId }, body }),
    addToQueue: (uri, deviceId) => send({ method: 'POST', path: '/me/player/queue', query: { uri, device_id: deviceId } }),
    setShuffle: (on, deviceId) => send({ method: 'PUT', path: '/me/player/shuffle', query: { state: String(on), device_id: deviceId } }),
    setRepeat: (state, deviceId) => send({ method: 'PUT', path: '/me/player/repeat', query: { state, device_id: deviceId } }),
  }
}
