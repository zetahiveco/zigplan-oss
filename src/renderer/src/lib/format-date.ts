const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MONTH = 30 * DAY
const YEAR = 365 * DAY

/** Relative time like "2 hours ago" / "3 days ago". */
export function formatDate(value: string | number | Date): string {
  const then = value instanceof Date ? value.getTime() : new Date(value).getTime()
  if (!Number.isFinite(then)) return ''
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (seconds < 45) return 'Just now'
  if (seconds < HOUR) {
    const minutes = Math.round(seconds / MINUTE)
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  }
  if (seconds < DAY) {
    const hours = Math.round(seconds / HOUR)
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  }
  if (seconds < MONTH) {
    const days = Math.round(seconds / DAY)
    return days === 1 ? '1 day ago' : `${days} days ago`
  }
  if (seconds < YEAR) {
    const months = Math.round(seconds / MONTH)
    return months === 1 ? '1 month ago' : `${months} months ago`
  }
  const years = Math.round(seconds / YEAR)
  return years === 1 ? '1 year ago' : `${years} years ago`
}
