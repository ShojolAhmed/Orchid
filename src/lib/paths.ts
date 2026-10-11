/** Single source of truth for route paths so links never drift from the router. */
export const paths = {
  home: '/',
  search: '/search',
  library: '/library',
  /** OAuth redirect target. The Spotify redirect URI must end with this path. */
  callback: '/callback',
  album: (id: string) => `/album/${id}`,
  artist: (id: string) => `/artist/${id}`,
  playlist: (id: string) => `/playlist/${id}`,
  searchFor: (query: string) => `/search?q=${encodeURIComponent(query)}`,
} as const
