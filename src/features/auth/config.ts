import { paths } from '../../lib/paths.ts'
import type { AuthConfig } from './types.ts'

/** Path the router serves the OAuth callback on. The configured redirect URI must end with it. */
export const CALLBACK_PATH: string = paths.callback

export interface ConfigIssue {
  code: 'missing-client-id' | 'missing-redirect-uri' | 'invalid-redirect-uri' | 'insecure-redirect-uri' | 'localhost-redirect-uri' | 'wrong-callback-path' | 'origin-mismatch'
  message: string
}

/** Explicit loopback IP literals, as `URL.hostname` reports them. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]'])

/**
 * Checks the public configuration against Spotify's redirect URI rules
 * (HTTPS, or HTTP on an explicit loopback IP; `localhost` is not allowed) and against
 * how this app actually runs. `currentOrigin` is the origin the app is open at; the PKCE
 * attempt is saved per-origin, so a redirect to a different origin could never complete.
 */
export function getConfigIssues(config: Pick<AuthConfig, 'clientId' | 'redirectUri'>, currentOrigin?: string): ConfigIssue[] {
  const issues: ConfigIssue[] = []
  if (!config.clientId) issues.push({ code: 'missing-client-id', message: 'Missing VITE_SPOTIFY_CLIENT_ID.' })
  if (!config.redirectUri) {
    issues.push({ code: 'missing-redirect-uri', message: 'Missing VITE_SPOTIFY_REDIRECT_URI.' })
    return issues
  }

  let url: URL
  try {
    url = new URL(config.redirectUri)
  } catch {
    issues.push({ code: 'invalid-redirect-uri', message: 'VITE_SPOTIFY_REDIRECT_URI is not a valid absolute URL.' })
    return issues
  }

  if (url.hostname === 'localhost') {
    issues.push({ code: 'localhost-redirect-uri', message: 'Spotify does not allow "localhost" in redirect URIs. Use http://127.0.0.1:5173/callback instead.' })
  } else if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))) {
    issues.push({ code: 'insecure-redirect-uri', message: 'Spotify requires HTTPS redirect URIs, except HTTP on a loopback IP such as 127.0.0.1.' })
  }

  if (url.pathname !== CALLBACK_PATH) {
    issues.push({ code: 'wrong-callback-path', message: `The redirect URI must end with ${CALLBACK_PATH}, the route Orchid handles.` })
  }
  if (url.search || url.hash) {
    issues.push({ code: 'invalid-redirect-uri', message: 'The redirect URI must not contain a query string or fragment.' })
  }

  if (currentOrigin && url.origin !== currentOrigin) {
    issues.push({
      code: 'origin-mismatch',
      message: `Orchid is open at ${currentOrigin} but the redirect URI points to ${url.origin}. Open the app at the redirect URI's origin so sign-in can finish.`,
    })
  }
  return issues
}

/**
 * Only same-app relative paths may be used as a post-login destination, so a crafted
 * link cannot turn the callback into an open redirect.
 */
export function sanitizeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/'
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (code < 0x20 || code === 0x7f) return '/'
  }
  try {
    const parsed = new URL(value, 'http://orchid.invalid')
    if (parsed.origin !== 'http://orchid.invalid') return '/'
    if (parsed.pathname === CALLBACK_PATH) return '/'
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/'
  }
}
