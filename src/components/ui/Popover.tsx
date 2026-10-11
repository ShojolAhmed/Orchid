import { useCallback, useId, useRef, useState, type ReactNode } from 'react'
import { useDismiss, type DismissReason } from '../../lib/useDismiss'
import { IconButton } from './IconButton'
import styles from './Popover.module.css'

interface PopoverProps {
  /** Names both the trigger button and the panel. */
  label: string
  icon: ReactNode
  children: ReactNode
  align?: 'start' | 'end'
  placement?: 'top' | 'bottom'
  /** Highlights the trigger (e.g. a feature is on). */
  active?: boolean
}

/** Icon button that toggles a small floating panel. Closes on Escape or outside press. */
export function Popover({ label, icon, children, align = 'end', placement = 'bottom', active }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const dismiss = useCallback((reason: DismissReason) => {
    // The panel unmounts on close, so focus inside it would fall to <body> and a keyboard user would lose
    // their place. After Escape, hand focus back to the trigger. Pointer dismissals are left alone: the
    // browser moves focus to whatever was clicked.
    const root = rootRef.current
    if (reason === 'escape' && root?.contains(document.activeElement)) root.querySelector<HTMLButtonElement>(':scope > button')?.focus()
    setOpen(false)
  }, [])
  useDismiss(rootRef, open, dismiss)

  const panelClasses = [styles.panel, align === 'end' ? styles.alignEnd : styles.alignStart, placement === 'top' ? styles.top : styles.bottom].join(' ')

  return (
    <div className={styles.root} ref={rootRef}>
      <IconButton label={label} active={active || open} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen((v) => !v)}>
        {icon}
      </IconButton>
      {open ? (
        <div id={panelId} role="dialog" aria-label={label} className={panelClasses}>
          {children}
        </div>
      ) : null}
    </div>
  )
}
