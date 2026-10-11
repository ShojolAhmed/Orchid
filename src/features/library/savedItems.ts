import { onAccountReset } from '../api'
import { catalogService } from '../catalog/service'
import { createSavedStore } from './savedStore'

/** The page-wide store of saved tracks and albums, bound to the real catalog service. */
export const savedStore = createSavedStore({
  check: (uris) => catalogService.checkSaved(uris),
  set: (uris, saved) => catalogService.setSaved(uris, saved),
  schedule: (task, ms) => void window.setTimeout(task, ms),
})

onAccountReset(() => savedStore.reset())
