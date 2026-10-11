import type { Track } from '../../catalog/types.ts'
import type { PlayOptions } from '../types.ts'
import type { StartPlaybackBody } from './webApi.ts'
import { contextAllowsOffset, isContextUri, isTrackUri, parseSpotifyInput } from './uris.ts'

/** Start/Resume Playback accepts a list of URIs. Keep requests comfortably small. */
export const MAX_URIS_PER_REQUEST = 100

export interface StartRequest {
  /** Identical keys are the same request: a repeated click is dropped while the first is in flight. */
  key: string
  body: StartPlaybackBody
  /** Used to label and recognise the context in the UI. */
  label: string
  contextUri: string | null
  contextId: string | null
}

export type StartRequestResult = { ok: true; request: StartRequest } | { ok: false; reason: 'sample' | 'unsupported-link' | 'not-music' }

/**
 * Turns "play this list of tracks from here" into a Web API body, using real Spotify URIs only.
 * Prefers a context (album or playlist) when one is known, because Spotify then queues the whole thing
 * properly. Tracks without a valid `spotify:track:` URI (the invented sample data) are never sent.
 */
export function buildStartRequest(tracks: Track[], options: PlayOptions): StartRequestResult {
  const startIndex = options.startIndex ?? 0
  const chosen = tracks[startIndex]
  const contextUri = isContextUri(options.contextUri) ? options.contextUri : null

  if (contextUri && (!chosen || !isTrackUri(chosen.uri))) {
    return { ok: true, request: { key: contextUri, body: { context_uri: contextUri }, label: options.label, contextUri, contextId: options.contextId } }
  }
  if (!chosen || !isTrackUri(chosen.uri)) return { ok: false, reason: 'sample' }

  if (contextUri && contextAllowsOffset(contextUri)) {
    return {
      ok: true,
      request: { key: `${contextUri}|${chosen.uri}`, body: { context_uri: contextUri, offset: { uri: chosen.uri } }, label: options.label, contextUri, contextId: options.contextId },
    }
  }

  const playable = tracks.filter((track) => isTrackUri(track.uri))
  const position = playable.findIndex((track) => track.uri === chosen.uri)
  const windowStart = position >= MAX_URIS_PER_REQUEST ? position : 0
  const slice = playable.slice(windowStart, windowStart + MAX_URIS_PER_REQUEST)
  return {
    ok: true,
    request: {
      key: `uris|${chosen.uri}`,
      body: { uris: slice.map((track) => track.uri as string), offset: { position: position - windowStart } },
      label: options.label,
      contextUri: null,
      contextId: options.contextId,
    },
  }
}

/** For a pasted link or URI: tracks play alone, albums, playlists and artists play as contexts. */
export function buildLinkRequest(input: string): StartRequestResult {
  const parsed = parseSpotifyInput(input)
  if (!parsed) return { ok: false, reason: 'unsupported-link' }
  if (parsed.kind === 'episode' || parsed.kind === 'show') return { ok: false, reason: 'not-music' }
  if (parsed.kind === 'track') {
    return { ok: true, request: { key: parsed.uri, body: { uris: [parsed.uri] }, label: 'Spotify link', contextUri: null, contextId: null } }
  }
  return { ok: true, request: { key: parsed.uri, body: { context_uri: parsed.uri }, label: 'Spotify link', contextUri: parsed.uri, contextId: `${parsed.kind}:${parsed.id}` } }
}
