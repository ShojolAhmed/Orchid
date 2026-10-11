/**
 * Spotify developer configuration, read from Vite env vars. Everything here is public: anything prefixed
 * `VITE_` is bundled into the browser build, so a client secret must never be added. PKCE needs none.
 * Scopes are not configured here; they are derived from the implemented features in `features/auth/scopes.ts`.
 */

const clientId = (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined)?.trim() ?? ''
const redirectUri = (import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string | undefined)?.trim() ?? ''

/** The name other Spotify apps show for this browser in their device list. */
const deviceName = (import.meta.env.VITE_SPOTIFY_DEVICE_NAME as string | undefined)?.trim() || 'Orchid Web Player'

export const spotifyConfig = {
  clientId,
  redirectUri,
  authorizeUrl: 'https://accounts.spotify.com/authorize',
  tokenUrl: 'https://accounts.spotify.com/api/token',
  apiBaseUrl: 'https://api.spotify.com/v1',
  deviceName,
} as const

export const isSpotifyConfigured = clientId.length > 0 && redirectUri.length > 0
