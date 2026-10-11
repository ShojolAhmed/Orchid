/**
 * Which tracks and albums are in the user's Spotify library, as far as Spotify has told us. Framework-free.
 *
 * - Lookups are batched: every URI asked for within a short window goes out in one `contains` request (the
 *   catalog service splits it into groups of 40 when needed). A URI already known or already being asked
 *   about is never requested again.
 * - Nothing is assumed. A URI Spotify has not answered for is `undefined`, not `false`.
 * - Saving or removing is NOT optimistic: the heart changes only after Spotify confirmed. While the request
 *   runs the URI is `pending`. A failure leaves the previous value and throws to the caller.
 * - A failed lookup is remembered, so a missing permission or a blocked app does not retry in a loop.
 */

export interface SavedSnapshot {
  readonly saved: ReadonlyMap<string, boolean>
  readonly pending: ReadonlySet<string>
  /** True once a lookup has failed; the UI can then hide the heart instead of showing a wrong state. */
  readonly lookupFailed: boolean
}

export interface SavedStoreDeps {
  check: (uris: string[]) => Promise<boolean[]>
  set: (uris: string[], saved: boolean) => Promise<void>
  /** Waits briefly so several rows asking at once become one request. */
  schedule: (task: () => void, ms: number) => void
  batchMs?: number
}

export interface SavedStore {
  getSnapshot(): SavedSnapshot
  subscribe(listener: () => void): () => void
  /** Ask about these URIs. Safe to call on every render. */
  request(uris: readonly string[]): void
  /** Record answers that came from somewhere else (the Liked Songs list is saved by definition). */
  remember(uris: readonly string[], saved: boolean): void
  /** Flip one item. Resolves with the new state once Spotify confirmed. Rejects (state unchanged) on failure. */
  toggle(uri: string): Promise<boolean>
  /** Forget everything (sign-out or a different account) and ignore answers still in flight. */
  reset(): void
}

export function createSavedStore(deps: SavedStoreDeps): SavedStore {
  let snapshot: SavedSnapshot = { saved: new Map(), pending: new Set(), lookupFailed: false }
  const listeners = new Set<() => void>()
  const wanted = new Set<string>()
  const asked = new Set<string>()
  let scheduled = false
  let epoch = 0

  function publish(next: Partial<SavedSnapshot>) {
    snapshot = { ...snapshot, ...next }
    listeners.forEach((listener) => listener())
  }

  function flush() {
    scheduled = false
    if (wanted.size === 0) return
    const batch = [...wanted]
    wanted.clear()
    const startedIn = epoch
    deps.check(batch).then(
      (answers) => {
        if (startedIn !== epoch) return
        const saved = new Map(snapshot.saved)
        batch.forEach((uri, index) => {
          // A write that finished while this lookup ran is newer than the lookup: keep it.
          if (!snapshot.pending.has(uri) && !snapshot.saved.has(uri)) saved.set(uri, answers[index] === true)
        })
        publish({ saved })
      },
      () => {
        if (startedIn !== epoch) return
        // Stay asked-about so a broken lookup is not repeated for every render.
        publish({ lookupFailed: true })
      },
    )
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    request(uris) {
      for (const uri of uris) {
        if (snapshot.saved.has(uri) || asked.has(uri)) continue
        asked.add(uri)
        wanted.add(uri)
      }
      if (wanted.size > 0 && !scheduled) {
        scheduled = true
        deps.schedule(flush, deps.batchMs ?? 40)
      }
    },
    remember(uris, saved) {
      const next = new Map(snapshot.saved)
      let changed = false
      for (const uri of uris) {
        asked.add(uri)
        if (next.get(uri) !== saved && !snapshot.pending.has(uri)) {
          next.set(uri, saved)
          changed = true
        }
      }
      if (changed) publish({ saved: next })
    },
    async toggle(uri) {
      if (snapshot.pending.has(uri)) return snapshot.saved.get(uri) === true
      const target = snapshot.saved.get(uri) !== true
      const startedIn = epoch
      publish({ pending: new Set(snapshot.pending).add(uri) })
      try {
        await deps.set([uri], target)
      } catch (error) {
        if (startedIn === epoch) {
          const pending = new Set(snapshot.pending)
          pending.delete(uri)
          publish({ pending })
        }
        throw error
      }
      if (startedIn === epoch) {
        const pending = new Set(snapshot.pending)
        pending.delete(uri)
        publish({ pending, saved: new Map(snapshot.saved).set(uri, target) })
      }
      return target
    },
    reset() {
      epoch += 1
      wanted.clear()
      asked.clear()
      scheduled = false
      publish({ saved: new Map(), pending: new Set(), lookupFailed: false })
    },
  }
}
