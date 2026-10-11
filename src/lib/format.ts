/** Formats milliseconds as m:ss (or h:mm:ss for an hour or more). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** "3 min 24 sec" style text for screen readers. */
export function spokenDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? `${m} min ${s} sec` : `${s} sec`
}

/** Total length for collection headers, e.g. "42 min" or "1 hr 12 min". */
export function formatTotalLength(ms: number): string {
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

export function formatCount(n: number): string {
  return compact.format(n)
}

export function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Release date as Spotify sent it (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`) in words, keeping only the precision
 * Spotify actually gave: "2024", "March 2024" or "March 5, 2024". Returns an empty string for anything else.
 */
export function formatReleaseDate(releaseDate: string | null): string {
  const match = releaseDate ? /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(releaseDate) : null
  if (!match) return ''
  const [, year, month, day] = match
  const monthName = month ? MONTHS[Number(month) - 1] : undefined
  if (!monthName) return year ?? ''
  return day ? `${monthName} ${Number(day)}, ${year}` : `${monthName} ${year}`
}
