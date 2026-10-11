import { Heart } from 'lucide-react'
import { IconButton } from './IconButton'

interface SaveButtonProps {
  /** What is being saved, e.g. the track or album title. */
  subject: string
  /** `undefined` means Spotify has not said yet; the control is disabled instead of guessing. */
  saved: boolean | undefined
  busy?: boolean
  onToggle: () => void
  className?: string
}

/**
 * Heart toggle for the user's Spotify library. Never optimistic: `saved` changes only after Spotify
 * confirmed, and while a request runs the control is disabled and marked busy.
 */
export function SaveButton({ subject, saved, busy = false, onToggle, className }: SaveButtonProps) {
  const label = saved === undefined ? `Checking whether ${subject} is in Your Library` : saved ? `Remove ${subject} from Your Library` : `Save ${subject} to Your Library`
  return (
    <IconButton
      label={label}
      active={saved === true}
      aria-pressed={saved === undefined ? undefined : saved}
      aria-busy={busy || undefined}
      disabled={saved === undefined || busy}
      data-persist={saved === true ? 'true' : undefined}
      className={className}
      onClick={onToggle}
    >
      <Heart size={18} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
    </IconButton>
  )
}
