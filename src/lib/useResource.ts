import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'
import { isAbort } from '../features/api/errors'

/**
 * Data hooks for the Spotify-backed pages. Both cancel work when inputs change or the page is left, ignore
 * any answer that arrives for an older request, and never run while `enabled` is false (so a signed-out
 * visitor makes no request that is certain to fail).
 */

export type ResourceStatus = 'idle' | 'loading' | 'success' | 'error'

export interface Resource<T> {
  status: ResourceStatus
  /** Last good data. Kept while a newer request loads so lists do not flash empty. */
  data: T | undefined
  error: Error | null
  reload: () => void
}

type Settled<T> = { key: string; data: T | undefined; error: Error | null }

/** `deps` must be primitives. `load` receives an AbortSignal that aborts when the inputs change or the component unmounts. */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, deps: DependencyList, enabled = true): Resource<T> {
  const [settled, setSettled] = useState<Settled<T> | undefined>(undefined)
  const [nonce, setNonce] = useState(0)
  const key = JSON.stringify([...deps, nonce])

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setSettled({ key, data, error: null })
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbort(error)) return
        setSettled((previous) => ({ key, data: previous?.data, error: error instanceof Error ? error : new Error(String(error)) }))
      },
    )
    return () => controller.abort()
    // `load` is keyed by `deps`, which callers own.
    // eslint-disable-next-line -- see above
  }, [...deps, nonce, enabled])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  if (!enabled) return { status: 'idle', data: undefined, error: null, reload }
  if (settled && settled.key === key) {
    return settled.error ? { status: 'error', data: settled.data, error: settled.error, reload } : { status: 'success', data: settled.data, error: null, reload }
  }
  return { status: 'loading', data: settled?.data, error: null, reload }
}

export interface PagedResource<T> {
  status: ResourceStatus
  items: T[]
  total: number | null
  /** Items Spotify returned that the app cannot show (episodes, local files, removed tracks). */
  skipped: number
  hasMore: boolean
  loadingMore: boolean
  /** Set when a "load more" request failed; the items already loaded stay on screen. */
  moreError: Error | null
  error: Error | null
  loadMore: () => void
  reload: () => void
}

interface PageLike<T> {
  items: T[]
  total: number | null
  next: string | null
  skipped: number
}

interface PagedState<T> {
  key: string
  items: T[]
  total: number | null
  skipped: number
  next: string | null
  error: Error | null
  loaded: boolean
}

/**
 * A list loaded one page at a time. `keyOf` removes duplicates that appear when the list changes between
 * pages. Only one "load more" runs at a time, and a result for an older key is dropped.
 */
export function usePagedResource<T>(
  loadPage: (cursor: string | null, signal: AbortSignal) => Promise<PageLike<T>>,
  keyOf: (item: T) => string,
  deps: DependencyList,
  enabled = true,
): PagedResource<T> {
  const [state, setState] = useState<PagedState<T> | undefined>(undefined)
  const [nonce, setNonce] = useState(0)
  const [more, setMore] = useState<{ key: string; loading: boolean; error: Error | null }>({ key: '', loading: false, error: null })
  const key = JSON.stringify([...deps, nonce])
  const latest = useRef({ key, next: null as string | null, loadPage, keyOf })
  const moreController = useRef<AbortController | null>(null)

  useEffect(() => {
    latest.current = { ...latest.current, key, loadPage, keyOf, next: state && state.key === key ? state.next : null }
  })

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    moreController.current?.abort()
    loadPage(null, controller.signal).then(
      (page) => {
        if (controller.signal.aborted) return
        const seen = new Set<string>()
        const items = page.items.filter((item) => {
          const id = keyOf(item)
          if (seen.has(id)) return false
          seen.add(id)
          return true
        })
        setState({ key, items, total: page.total, skipped: page.skipped, next: page.next, error: null, loaded: true })
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbort(error)) return
        setState({ key, items: [], total: null, skipped: 0, next: null, error: error instanceof Error ? error : new Error(String(error)), loaded: false })
      },
    )
    return () => controller.abort()
    // `loadPage` and `keyOf` are keyed by `deps`, which callers own.
    // eslint-disable-next-line -- see above
  }, [...deps, nonce, enabled])

  useEffect(() => () => moreController.current?.abort(), [])

  const loadMore = useCallback(() => {
    const current = latest.current
    if (current.next === null) return
    if (moreController.current && !moreController.current.signal.aborted && more.loading) return
    const controller = new AbortController()
    moreController.current = controller
    const cursor = current.next
    setMore({ key: current.key, loading: true, error: null })
    current.loadPage(cursor, controller.signal).then(
      (page) => {
        if (controller.signal.aborted) return
        setState((previous) => {
          if (!previous || previous.key !== current.key) return previous
          const seen = new Set(previous.items.map(current.keyOf))
          const fresh = page.items.filter((item) => !seen.has(current.keyOf(item)))
          return { ...previous, items: [...previous.items, ...fresh], total: page.total ?? previous.total, skipped: previous.skipped + page.skipped, next: page.next }
        })
        setMore({ key: current.key, loading: false, error: null })
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbort(error)) return
        setMore({ key: current.key, loading: false, error: error instanceof Error ? error : new Error(String(error)) })
      },
    )
  }, [more.loading])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  if (!enabled) return { status: 'idle', items: [], total: null, skipped: 0, hasMore: false, loadingMore: false, moreError: null, error: null, loadMore, reload }
  if (!state || state.key !== key) return { status: 'loading', items: [], total: null, skipped: 0, hasMore: false, loadingMore: false, moreError: null, error: null, loadMore, reload }
  const loadingMore = more.key === key && more.loading
  return {
    status: state.error ? 'error' : 'success',
    items: state.items,
    total: state.total,
    skipped: state.skipped,
    hasMore: state.next !== null,
    loadingMore,
    moreError: more.key === key ? more.error : null,
    error: state.error,
    loadMore,
    reload,
  }
}
