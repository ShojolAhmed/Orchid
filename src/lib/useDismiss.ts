import { useEffect, type RefObject } from 'react'

export type DismissReason = 'escape' | 'pointer'

/** Calls `onDismiss` on Escape or on a pointer press outside `ref`, while `active`. The reason lets callers restore focus only for keyboard dismissal. */
export function useDismiss(ref: RefObject<HTMLElement | null>, active: boolean, onDismiss: (reason: DismissReason) => void) {
  useEffect(() => {
    if (!active) return
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onDismiss('pointer')
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss('escape')
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, active, onDismiss])
}
