import { TriangleAlert, RotateCw } from 'lucide-react'
import { Button } from './Button'
import { EmptyState } from './EmptyState'

interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
}

export function ErrorState({ title = 'Something went wrong', description = 'We could not load this. Check your connection and try again.', onRetry }: ErrorStateProps) {
  return (
    <div role="alert">
      <EmptyState icon={<TriangleAlert size={28} />} title={title} description={description}>
        {onRetry ? (
          <Button variant="secondary" icon={<RotateCw size={16} />} onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </EmptyState>
    </div>
  )
}
