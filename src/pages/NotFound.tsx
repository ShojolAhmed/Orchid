import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/ui'
import { usePageTitle } from '../lib/usePageTitle'

export function NotFound() {
  usePageTitle('Page not found')
  return (
    <EmptyState icon={<Compass size={28} />} title="Page not found" description="That address doesn't match anything in Orchid.">
      <Link to="/" style={{ color: 'var(--color-accent-hover)', fontWeight: 700 }}>
        Go to Home
      </Link>
    </EmptyState>
  )
}
