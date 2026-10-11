import { useEffect, useRef, type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { TopBar } from './TopBar'
import styles from './AppShell.module.css'

interface AppShellProps {
  navigation: ReactNode
  account: ReactNode
  player: ReactNode
  queuePanel: ReactNode
  queueOpen: boolean
}

/**
 * Pure layout. The app layer supplies the connected navigation, account menu, player and queue
 * as slots, so nothing in `components/` depends on a feature.
 */
export function AppShell({ navigation, account, player, queuePanel, queueOpen }: AppShellProps) {
  const mainRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()

  // New page, new scroll position.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className={[styles.shell, queueOpen && styles.queueOpen].filter(Boolean).join(' ')}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <div className={styles.nav}>{navigation}</div>
      <main id="main" ref={mainRef} className={styles.main} tabIndex={-1}>
        <TopBar account={account} />
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>
      {queuePanel}
      <div className={styles.player}>{player}</div>
    </div>
  )
}
