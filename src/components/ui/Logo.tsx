import { useId } from 'react'

interface LogoProps {
  size?: number
}

/** The Orchid mark: three petals around a core, in the accent gradient. Decorative. */
export function Logo({ size = 28 }: LogoProps) {
  const gradientId = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff3fb0" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <g fill={`url(#${gradientId})`}>
        <ellipse cx="16" cy="9" rx="5.2" ry="7.4" opacity="0.95" />
        <ellipse cx="16" cy="9" rx="5.2" ry="7.4" transform="rotate(120 16 16)" opacity="0.8" />
        <ellipse cx="16" cy="9" rx="5.2" ry="7.4" transform="rotate(240 16 16)" opacity="0.65" />
      </g>
      <circle cx="16" cy="16" r="3.2" fill="#0a090c" />
    </svg>
  )
}
