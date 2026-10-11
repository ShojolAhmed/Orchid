import { createSpotifySession, type SessionDeps, type SpotifySession } from '../../src/features/auth/session.ts'
import { createAttemptStore, createCredentialStore, type KeyValueStorage } from '../../src/features/auth/storage.ts'
import type { AuthConfig } from '../../src/features/auth/types.ts'

export const CONFIG: AuthConfig = {
  clientId: 'test-client-id',
  redirectUri: 'http://127.0.0.1:5173/callback',
  authorizeUrl: 'https://accounts.spotify.com/authorize',
  tokenUrl: 'https://accounts.spotify.com/api/token',
  apiBaseUrl: 'https://api.spotify.com/v1',
}

export class MemoryStorage implements KeyValueStorage {
  readonly map = new Map<string, string>()
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  dump() {
    return JSON.stringify([...this.map.entries()])
  }
}

/** In-process stand-in for the Web Locks API: one holder at a time per name, FIFO. */
export function createFakeLocks() {
  const tails = new Map<string, Promise<unknown>>()
  return <T>(name: string, task: () => Promise<T>): Promise<T> => {
    const previous = tails.get(name) ?? Promise.resolve()
    const run = previous.then(task, task)
    tails.set(
      name,
      run.catch(() => undefined),
    )
    return run
  }
}

export interface RecordedRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: URLSearchParams | null
}

export type Responder = (request: RecordedRequest) => Response | Promise<Response>

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const tokenBody = (overrides: Record<string, unknown> = {}) => ({
  access_token: 'ACCESS-1',
  token_type: 'Bearer',
  expires_in: 3600,
  refresh_token: 'REFRESH-1',
  scope: '',
  ...overrides,
})

export function createFakeFetch(responder: Responder) {
  const requests: RecordedRequest[] = []
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value
    })
    const request: RecordedRequest = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers,
      body: init?.body instanceof URLSearchParams ? init.body : null,
    }
    requests.push(request)
    return responder(request)
  }) as typeof fetch
  return { fetch: fetchFn, requests }
}

export interface Harness {
  session: SpotifySession
  local: MemoryStorage
  tab: MemoryStorage
  clock: { now: number }
  navigations: string[]
  requests: RecordedRequest[]
}

export function createHarness(options: { responder?: Responder; config?: AuthConfig; requiredScopes?: string[]; local?: MemoryStorage; locks?: SessionDeps['withLock']; clock?: { now: number }; origin?: string } = {}): Harness {
  const local = options.local ?? new MemoryStorage()
  const tab = new MemoryStorage()
  const clock = options.clock ?? { now: 1_700_000_000_000 }
  const navigations: string[] = []
  const { fetch, requests } = createFakeFetch(options.responder ?? (() => json({ error: 'unexpected' }, 500)))
  const session = createSpotifySession({
    config: options.config ?? CONFIG,
    requiredScopes: options.requiredScopes ?? [],
    fetch,
    credentials: createCredentialStore(local),
    attempts: createAttemptStore(tab),
    navigate: (url) => navigations.push(url),
    now: () => clock.now,
    currentOrigin: () => options.origin ?? 'http://127.0.0.1:5173',
    withLock: options.locks ?? createFakeLocks(),
    fetchProfile: undefined,
  })
  return { session, local, tab, clock, navigations, requests }
}

/** Starts a login and returns the `state` Spotify would echo back, read from the authorize URL the app navigated to. */
export async function beginLogin(harness: Harness, returnTo?: string): Promise<{ state: string; url: URL }> {
  await harness.session.login(returnTo)
  const target = harness.navigations.at(-1)
  if (!target) throw new Error('login() did not navigate')
  const url = new URL(target)
  return { state: url.searchParams.get('state') ?? '', url }
}

export const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
