import { NavLink } from 'react-router-dom'
import { Artwork, Logo, Skeleton, type ArtworkSource } from '../ui'
import { navItems } from './navItems'
import styles from './Navigation.module.css'

export interface NavShortcut {
  id: string
  to: string
  title: string
  subtitle: string
  artwork: ArtworkSource
}

export interface ShortcutsView {
  status: 'loading' | 'error' | 'ready'
  items: NavShortcut[]
  onRetry: () => void
}

interface NavigationProps {
  shortcuts: ShortcutsView
}

/**
 * One nav component, three presentations (see CSS): full sidebar on desktop,
 * icon rail on tablet, bottom tab bar on mobile. Library shortcuts show on
 * desktop and (artwork only) on the rail.
 */
export function Navigation({ shortcuts }: NavigationProps) {
  return (
    <nav className={styles.nav} aria-label="Primary">
      <NavLink to="/" className={styles.brand} aria-label="Orchid home">
        <Logo size={30} />
        <span className={styles.brandName}>Orchid</span>
      </NavLink>
      <ul className={styles.list}>
        {navItems.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
            >
              <Icon size={22} aria-hidden="true" />
              <span className={styles.label}>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      <section className={styles.shortcuts} aria-labelledby="shortcuts-heading">
        <h2 id="shortcuts-heading" className={styles.shortcutsHeading}>
          Your playlists
        </h2>
        {shortcuts.status === 'loading' ? (
          <div className={styles.shortcutsLoading} aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height="2.75rem" radius="var(--radius-md)" />
            ))}
          </div>
        ) : shortcuts.status === 'error' ? (
          <div className={styles.shortcutsError} role="alert">
            <p>Could not load playlists.</p>
            <button type="button" className={styles.retry} onClick={shortcuts.onRetry}>
              Try again
            </button>
          </div>
        ) : (
          <ul className={styles.shortcutList}>
            {shortcuts.items.map((item) => (
              <li key={item.id}>
                <NavLink
                  to={item.to}
                  aria-label={item.title}
                  title={item.title}
                  className={({ isActive }) => (isActive ? `${styles.shortcut} ${styles.shortcutActive}` : styles.shortcut)}
                >
                  <Artwork source={item.artwork} label={item.title} className={styles.shortcutArt} />
                  <span className={styles.shortcutText}>
                    <span className={styles.shortcutTitle}>{item.title}</span>
                    <span className={styles.shortcutSub}>{item.subtitle}</span>
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className={styles.disclaimer}>Unofficial player. Not affiliated with Spotify.</p>
    </nav>
  )
}
