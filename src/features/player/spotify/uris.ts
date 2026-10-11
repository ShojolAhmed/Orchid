/**
 * Spotify URIs. The Web API wants `spotify:track:<id>`, never an `open.spotify.com` link or a bare id,
 * so everything that reaches a playback request goes through these checks first.
 */

export type SpotifyKind = 'track' | 'album' | 'playlist' | 'artist' | 'episode' | 'show'

export interface ParsedSpotifyUri {
  kind: SpotifyKind
  id: string
  uri: string
}

const KINDS: readonly SpotifyKind[] = ['track', 'album', 'playlist', 'artist', 'episode', 'show']
/** Spotify ids are 22 base-62 characters. */
const ID = /^[0-9A-Za-z]{22}$/

function isKind(value: string): value is SpotifyKind {
  return (KINDS as readonly string[]).includes(value)
}

function build(kind: string, id: string): ParsedSpotifyUri | null {
  if (!isKind(kind) || !ID.test(id)) return null
  return { kind, id, uri: `spotify:${kind}:${id}` }
}

/** Parses a canonical `spotify:<kind>:<id>` URI. Anything else (links, local files, user collections) is `null`. */
export function parseSpotifyUri(value: string): ParsedSpotifyUri | null {
  const parts = value.trim().split(':')
  if (parts.length !== 3 || parts[0] !== 'spotify') return null
  return build(parts[1] ?? '', parts[2] ?? '')
}

/**
 * Accepts what a person might paste: a Spotify URI, or a share link such as
 * `https://open.spotify.com/track/<id>?si=...` (an `intl-xx` path prefix is allowed).
 * Returns the canonical URI, or `null` when it is not a recognisable Spotify item.
 */
export function parseSpotifyInput(input: string): ParsedSpotifyUri | null {
  const text = input.trim()
  if (!text) return null
  if (text.startsWith('spotify:')) return parseSpotifyUri(text)
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com') return null
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments[0]?.startsWith('intl-')) segments.shift()
  if (segments.length !== 2) return null
  return build(segments[0] ?? '', segments[1] ?? '')
}

export function isTrackUri(value: string | undefined | null): value is string {
  return typeof value === 'string' && parseSpotifyUri(value)?.kind === 'track'
}

/** Kinds that `context_uri` accepts for Start/Resume Playback ("albums, artists & playlists"). */
export function isContextUri(value: string | undefined | null): value is string {
  if (typeof value !== 'string') return false
  const kind = parseSpotifyUri(value)?.kind
  return kind === 'album' || kind === 'playlist' || kind === 'artist'
}

/** `offset` is only allowed for album and playlist contexts. */
export function contextAllowsOffset(contextUri: string): boolean {
  const kind = parseSpotifyUri(contextUri)?.kind
  return kind === 'album' || kind === 'playlist'
}

/** The id at the end of a URI, or an empty string. Used to link back into the app. */
export function idFromUri(uri: string | undefined | null): string {
  if (!uri) return ''
  const last = uri.split(':').pop() ?? ''
  return ID.test(last) ? last : ''
}
