/**
 * Scopes are requested per feature, and only for features that exist in the app.
 * Requesting a scope the app does not use widens what a leaked token could do and
 * makes the consent screen scarier for no benefit.
 */

export type FeatureId = 'profile' | 'playback' | 'library' | 'playlists' | 'following' | 'personalization'

export const FEATURE_SCOPES: Record<FeatureId, readonly string[]> = {
  /** `GET /me` returns display_name, id, images and uri with no scope. */
  profile: [],
  /**
   * Web Playback SDK plus the Player endpoints. `streaming` is documented as the scope for the SDK
   * and `user-modify-playback-state` as the one the Player endpoints (start, transfer, queue,
   * shuffle, repeat) require; both confirmed on Spotify's scopes page. `user-read-email` and
   * `user-read-private` are not mentioned in the SDK pages; they are kept because community reports
   * of "Invalid token scopes" name all three. Re-test whether they can be dropped on a real account.
   */
  playback: ['streaming', 'user-modify-playback-state', 'user-read-email', 'user-read-private'],
  /**
   * Saved tracks and albums: read them, check whether an item is saved, save and remove. Spotify's
   * `PUT/DELETE /me/library` and `GET /me/library/contains` list several scopes without saying which
   * applies to which item type; for tracks and albums these two are the ones that belong.
   */
  library: ['user-library-read', 'user-library-modify'],
  /**
   * The user's playlists (private and collaborative ones need their own read scopes) and creating or
   * changing them. Both modify scopes are needed because an existing playlist may be public or private.
   */
  playlists: ['playlist-read-private', 'playlist-read-collaborative', 'playlist-modify-private', 'playlist-modify-public'],
  /** Read-only list of followed artists. Orchid never follows or unfollows anyone. */
  following: ['user-follow-read'],
  /** Home shelves: the user's top artists and recently played tracks. */
  personalization: ['user-top-read', 'user-read-recently-played'],
}

/** Features that are actually implemented. Each one widens the scopes requested at sign-in. */
export const ENABLED_FEATURES: readonly FeatureId[] = ['profile', 'playback', 'library', 'playlists', 'following', 'personalization']

export function scopesForFeatures(features: readonly FeatureId[]): string[] {
  return [...new Set(features.flatMap((feature) => FEATURE_SCOPES[feature]))].sort()
}

export const REQUIRED_SCOPES: readonly string[] = scopesForFeatures(ENABLED_FEATURES)

/** Spotify returns granted scopes as one space-separated string. */
export function parseScopes(value: string | undefined | null): string[] {
  return [...new Set((value ?? '').split(/\s+/).filter(Boolean))].sort()
}

export function findMissingScopes(required: readonly string[], granted: readonly string[]): string[] {
  const have = new Set(granted)
  return required.filter((scope) => !have.has(scope))
}
