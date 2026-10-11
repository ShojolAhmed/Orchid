import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from './EmptyState'

interface RestrictedStateProps {
  title: string
  description: string
  /** Usually a Connect or Reconnect button. */
  children?: ReactNode
}

/** A full-section state for "you cannot see this yet": not connected, a permission is missing, or Spotify refuses access. */
export function RestrictedState({ title, description, children }: RestrictedStateProps) {
  return (
    <div role="status">
      <EmptyState icon={<Lock size={28} />} title={title} description={description}>
        {children}
      </EmptyState>
    </div>
  )
}
