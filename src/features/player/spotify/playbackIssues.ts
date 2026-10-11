/**
 * Every user-facing playback problem lives here so the wording stays consistent and reviewable.
 * Messages say what is wrong and what the person can do about it. None of them contains a token.
 */

import type { PlaybackAction } from '../types.ts'


export type PlaybackIssueCode =
  | 'sign-in-required'
  | 'permission-missing'
  | 'sdk-load-failed'
  | 'unsupported-browser'
  | 'authentication'
  | 'premium-required'
  | 'connect-failed'
  | 'offline'
  | 'playback-failed'
  | 'restricted'
  | 'no-device'
  | 'rate-limited'
  | 'network'
  | 'service'

export type { PlaybackAction }

export interface PlaybackIssue {
  code: PlaybackIssueCode
  message: string
  action: PlaybackAction | null
}

export const playbackIssues = {
  signInRequired: (): PlaybackIssue => ({ code: 'sign-in-required', message: 'Connect your Spotify account to play music in Orchid.', action: 'sign-in' }),
  permissionMissing: (): PlaybackIssue => ({
    code: 'permission-missing',
    message: 'Orchid needs one more Spotify permission to play music. Reconnect Spotify and approve it.',
    action: 'reconnect-spotify',
  }),
  sdkLoadFailed: (): PlaybackIssue => ({
    code: 'sdk-load-failed',
    message: "Couldn't load Spotify's player. Check your connection, and that no extension or network policy blocks sdk.scdn.co, then retry.",
    action: 'retry-player',
  }),
  unsupportedBrowser: (): PlaybackIssue => ({
    code: 'unsupported-browser',
    message: "This browser can't play protected Spotify audio (it needs encrypted media support). Try a current Chrome, Edge, Firefox or Safari.",
    action: null,
  }),
  authentication: (): PlaybackIssue => ({
    code: 'authentication',
    message: 'Spotify rejected the sign-in used by the player. Reconnect Spotify to refresh it.',
    action: 'reconnect-spotify',
  }),
  premiumRequired: (): PlaybackIssue => ({
    code: 'premium-required',
    message: "Spotify says this account can't play music in a browser. The Web Playback SDK needs Spotify Premium (mobile-only Premium plans are excluded).",
    action: null,
  }),
  connectFailed: (): PlaybackIssue => ({ code: 'connect-failed', message: "Couldn't connect the Orchid player to Spotify. Retry in a moment.", action: 'retry-player' }),
  offline: (): PlaybackIssue => ({ code: 'offline', message: 'The Orchid player lost its connection to Spotify and is trying to reconnect.', action: 'retry-player' }),
  playbackFailed: (detail?: string): PlaybackIssue => ({
    code: 'playback-failed',
    message: `Spotify couldn't play that${detail ? ` (${detail})` : ''}. It may not be available in your region or on your account.`,
    action: null,
  }),
  restricted: (): PlaybackIssue => ({
    code: 'restricted',
    message:
      "Spotify refused the playback request. In development mode only users added under User Management can use the app, the app owner needs an active Premium subscription, and the account must be Premium.",
    action: null,
  }),
  noDevice: (): PlaybackIssue => ({
    code: 'no-device',
    message: "Spotify can't find the Orchid player right now. Use “Play on this browser” in the devices menu, or retry the player.",
    action: 'play-here',
  }),
  rateLimited: (seconds?: number): PlaybackIssue => ({
    code: 'rate-limited',
    message: `Spotify is limiting requests right now${seconds ? `. Try again in about ${seconds} seconds` : '. Try again in a little while'}.`,
    action: null,
  }),
  network: (): PlaybackIssue => ({ code: 'network', message: "Couldn't reach Spotify. Check your connection and try again.", action: 'retry-player' }),
  service: (): PlaybackIssue => ({ code: 'service', message: 'Spotify had a problem handling that request. Try again.', action: null }),
} as const

export const playbackMessages = {
  noPlayableUri: "This item can't be played because it has no Spotify link. Try a different one.",
  notReady: 'The Spotify player is still starting. Try again in a moment.',
  nothingToPlay: 'Choose something to play first.',
  notActive: 'Start playback in this browser first, then try again.',
  notAllowed: "Spotify isn't allowing that right now (for example during an ad).",
  autoplayBlocked: 'Your browser blocked autoplay. Press play to start.',
  queueUnsupportedRemove: "Spotify doesn't let apps remove items from the queue. Skip ahead instead.",
  unsupportedLink: 'Paste a Spotify link or URI for a track, album, playlist or artist.',
  linkNotMusic: 'Orchid plays tracks, albums, playlists and artists. Podcasts and shows are not supported yet.',
  commandFailed: "Spotify couldn't do that. Try again.",
} as const
