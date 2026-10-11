import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconButton } from '../ui'
import styles from './TopBar.module.css'

interface TopBarProps {
  /** Account area (connect action, profile menu), supplied by the app layer. */
  account: ReactNode
}

/** Sticky bar above every page: history controls and the account area. */
export function TopBar({ account }: TopBarProps) {
  const navigate = useNavigate()
  return (
    <div className={styles.bar}>
      <div className={styles.history}>
        <IconButton label="Go back" className={styles.circle} onClick={() => navigate(-1)}>
          <ChevronLeft size={22} />
        </IconButton>
        <IconButton label="Go forward" className={styles.circle} onClick={() => navigate(1)}>
          <ChevronRight size={22} />
        </IconButton>
      </div>

      <div className={styles.right}>
        {account}
      </div>
    </div>
  )
}
