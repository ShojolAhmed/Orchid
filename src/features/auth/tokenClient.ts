import type { AuthConfig } from './types.ts'
import { parseScopes } from './scopes.ts'

/** What a successful token response gives us. Lifetimes come from Spotify's `expires_in`; nothing is assumed. */
export interface TokenGrant {
  accessToken: string
  expiresInSeconds: number
  /** Spotify does not promise a refresh token on every response. */
  refreshToken: string | null
  /** Scopes Spotify reports as granted, or null if the response did not say. */
  scopes: string[] | null
}

export type TokenResult =
  | { ok: true; grant: TokenGrant }
  /** Spotify answered and said no (4xx). `oauthError` is the allow-listed `error` value, e.g. `invalid_grant`. */
  | { ok: false; kind: 'rejected'; status: number; oauthError: string | null }
  /** Network failure, timeout, 429 or 5xx. Nothing was decided; trying again later may work. */
  | { ok: false; kind: 'transient'; status: number; oauthError: null }
  /** 200 but not a token response we can use. */
  | { ok: false; kind: 'malformed'; status: number; oauthError: null }

type FetchLike = typeof fetch

const REQUEST_TIMEOUT_MS = 15_000

/** Only short snake_case identifiers survive, so server-provided text can never smuggle content into the UI. */
export function safeOAuthError(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z_]{1,64}$/.test(value) ? value : null
}

async function postToken(config: AuthConfig, body: Record<string, string>, fetchFn: FetchLike): Promise<TokenResult> {
  let response: Response
  try {
    response = await fetchFn(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    return { ok: false, kind: 'transient', status: 0, oauthError: null }
  }

  const json: unknown = await response.json().catch(() => null)
  const record = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : null

  if (response.status === 429 || response.status >= 500) return { ok: false, kind: 'transient', status: response.status, oauthError: null }
  if (!response.ok) return { ok: false, kind: 'rejected', status: response.status, oauthError: safeOAuthError(record?.error) }

  if (
    !record ||
    typeof record.access_token !== 'string' ||
    record.access_token.length === 0 ||
    typeof record.token_type !== 'string' ||
    record.token_type.toLowerCase() !== 'bearer' ||
    typeof record.expires_in !== 'number' ||
    !Number.isFinite(record.expires_in) ||
    record.expires_in <= 0 ||
    (record.refresh_token !== undefined && (typeof record.refresh_token !== 'string' || record.refresh_token.length === 0))
  ) {
    return { ok: false, kind: 'malformed', status: response.status, oauthError: null }
  }

  return {
    ok: true,
    grant: {
      accessToken: record.access_token,
      expiresInSeconds: record.expires_in,
      refreshToken: typeof record.refresh_token === 'string' ? record.refresh_token : null,
      scopes: typeof record.scope === 'string' ? parseScopes(record.scope) : null,
    },
  }
}

/** Authorization Code + PKCE: trades the one-time code for tokens. No client secret, no Authorization header. */
export function exchangeAuthorizationCode(args: { config: AuthConfig; code: string; verifier: string; fetch: FetchLike }): Promise<TokenResult> {
  return postToken(
    args.config,
    {
      grant_type: 'authorization_code',
      code: args.code,
      redirect_uri: args.config.redirectUri,
      client_id: args.config.clientId,
      code_verifier: args.verifier,
    },
    args.fetch,
  )
}

/** Public-client refresh: `client_id` in the body is required for PKCE, and no secret is involved. */
export function refreshAccessToken(args: { config: AuthConfig; refreshToken: string; fetch: FetchLike }): Promise<TokenResult> {
  return postToken(args.config, { grant_type: 'refresh_token', refresh_token: args.refreshToken, client_id: args.config.clientId }, args.fetch)
}

/** Builds the `/authorize` URL for the PKCE flow. `scope` is omitted when no scopes are needed. */
export function buildAuthorizeUrl(args: { config: AuthConfig; scopes: readonly string[]; state: string; challenge: string }): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: args.config.clientId,
    redirect_uri: args.config.redirectUri,
    code_challenge_method: 'S256',
    code_challenge: args.challenge,
    state: args.state,
  })
  if (args.scopes.length > 0) params.set('scope', args.scopes.join(' '))
  return `${args.config.authorizeUrl}?${params.toString()}`
}

/** Error names that mean the saved refresh token can never work again. Anything else is treated as transient or unknown. */
export function isTerminalRefreshError(oauthError: string | null): boolean {
  return oauthError === 'invalid_grant' || oauthError === 'invalid_client' || oauthError === 'unauthorized_client'
}
