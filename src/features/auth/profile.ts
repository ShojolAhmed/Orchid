import { AuthRequiredError, profileMessages } from './errors.ts'
import type { SpotifyProfile } from './types.ts'

export type ProfileResult =
  | { status: 'ready'; profile: SpotifyProfile }
  | { status: 'restricted'; message: string }
  | { status: 'error'; message: string }
  /** There is no session any more (the session layer has already updated itself). */
  | { status: 'unauthenticated' }

interface ProfileDeps {
  apiBaseUrl: string
  getAccessToken: () => Promise<string>
  invalidateAccessToken: () => void
  fetch: typeof fetch
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const isHttps = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

/** Prefers the smallest image that is at least 64px wide (it only renders as an avatar); otherwise the largest available. */
function pickImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null
  const candidates = images.filter(isRecord).filter((image) => isHttps(image.url)) as Array<{ url: string; width?: unknown }>
  if (candidates.length === 0) return null
  const width = (image: { width?: unknown }) => (typeof image.width === 'number' ? image.width : 0)
  const big = candidates.filter((image) => width(image) >= 64).sort((a, b) => width(a) - width(b))
  return (big[0] ?? [...candidates].sort((a, b) => width(b) - width(a))[0]).url
}

/** Keeps only the few fields the UI uses. Returns null if the payload is not a user object. */
export function mapProfile(json: unknown): SpotifyProfile | null {
  if (!isRecord(json) || typeof json.id !== 'string' || json.id.length === 0) return null
  const displayName = typeof json.display_name === 'string' && json.display_name.trim() ? json.display_name.trim() : json.id
  const external = isRecord(json.external_urls) ? json.external_urls.spotify : undefined
  return {
    id: json.id,
    displayName,
    imageUrl: pickImage(json.images),
    profileUrl: isHttps(external) ? external : null,
    product: typeof json.product === 'string' ? json.product : null,
  }
}

async function requestProfile(deps: ProfileDeps, accessToken: string): Promise<Response | null> {
  try {
    return await deps.fetch(`${deps.apiBaseUrl}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return null
  }
}

/** `GET /me`. A 401 means the access token was rejected: refresh once and retry before giving up. */
export async function fetchProfile(deps: ProfileDeps): Promise<ProfileResult> {
  try {
    let response = await requestProfile(deps, await deps.getAccessToken())
    if (response?.status === 401) {
      deps.invalidateAccessToken()
      response = await requestProfile(deps, await deps.getAccessToken())
    }

    if (!response) return { status: 'error', message: profileMessages.failed }
    if (response.status === 403) return { status: 'restricted', message: profileMessages.restricted }
    if (response.status === 429) return { status: 'error', message: profileMessages.rateLimited }
    if (!response.ok) return { status: 'error', message: profileMessages.failed }

    const profile = mapProfile(await response.json().catch(() => null))
    return profile ? { status: 'ready', profile } : { status: 'error', message: profileMessages.failed }
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      // Session gone: the session layer has handled it. A passing network problem is only a failed profile load.
      return error.authError.code === 'network' ? { status: 'error', message: error.authError.message } : { status: 'unauthenticated' }
    }
    return { status: 'error', message: profileMessages.failed }
  }
}
