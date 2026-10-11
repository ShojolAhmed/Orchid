import type { SdkHost, SdkNamespace } from './sdkTypes.ts'

export const SDK_URL = 'https://sdk.scdn.co/spotify-player.js'
export const SDK_LOAD_TIMEOUT_MS = 15_000

export class SdkLoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SdkLoadError'
  }
}

export interface SdkLoaderEnv {
  /** Where the SDK installs `Spotify` and calls `onSpotifyWebPlaybackSDKReady` (the `window`). */
  host: SdkHost
  /** Inserts the script tag. `onError` fires if it cannot load (offline, blocked by an extension or CSP). Returns a remover. */
  addScript(src: string, onError: () => void): () => void
  setTimeout(callback: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
  timeoutMs?: number
}

/**
 * Returns a function that loads the SDK script at most once. Concurrent callers share one promise, a
 * page where the SDK is already present resolves immediately, and a failed load is forgotten (and its
 * script tag removed) so a later retry starts clean.
 *
 * The ready callback is installed before the script is added because the SDK calls it as soon as it loads.
 */
export function createSdkLoader(env: SdkLoaderEnv): () => Promise<SdkNamespace> {
  let pending: Promise<SdkNamespace> | null = null

  return function loadSdk() {
    if (env.host.Spotify) return Promise.resolve(env.host.Spotify)
    if (pending) return pending

    pending = new Promise<SdkNamespace>((resolve, reject) => {
      let settled = false
      let remove: () => void = () => {}
      let timer: unknown

      const finish = (error: SdkLoadError | null) => {
        if (settled) return
        const sdk = env.host.Spotify
        const failure = error ?? (sdk ? null : new SdkLoadError('The Spotify player script loaded but did not provide a player.'))
        settled = true
        env.clearTimeout(timer)
        if (failure || !sdk) {
          remove()
          if (env.host.onSpotifyWebPlaybackSDKReady === onReady) env.host.onSpotifyWebPlaybackSDKReady = undefined
          pending = null
          reject(failure)
        } else {
          resolve(sdk)
        }
      }
      const onReady = () => finish(null)

      env.host.onSpotifyWebPlaybackSDKReady = onReady
      timer = env.setTimeout(() => finish(new SdkLoadError('Timed out loading the Spotify player script.')), env.timeoutMs ?? SDK_LOAD_TIMEOUT_MS)
      remove = env.addScript(SDK_URL, () => finish(new SdkLoadError('The Spotify player script could not be loaded.')))
    })
    return pending
  }
}
