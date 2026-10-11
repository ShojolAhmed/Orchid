import { getSpotifyEndpoints } from '../api'
import { createCatalogService } from './catalogService'

/** The catalog service bound to the real Spotify client. UI code imports this; tests build their own. */
export const catalogService = createCatalogService(() => getSpotifyEndpoints())
