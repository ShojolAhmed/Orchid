import { useEffect } from 'react'

/** Sets the document title (screen readers announce it on navigation). */
export function usePageTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Orchid` : 'Orchid'
  }, [title])
}
