const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Relative time for lists: just now / 5 minutes ago / 3 hours ago / yesterday / Oct 8 / Oct 8, 2025 */
export function formatRelative(ts: number, now = Date.now()): string {
  const diff = now - ts
  if (diff < MINUTE) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`

  const d = new Date(ts)
  const today = new Date(now)
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  if (ts >= startOfToday) return `${Math.floor(diff / HOUR)} 小时前`
  if (ts >= startOfToday - DAY) return '昨天'
  const md = `${d.getMonth() + 1}月${d.getDate()}日`
  return d.getFullYear() === today.getFullYear() ? md : `${d.getFullYear()}年${md}`
}

/** Date: omits the year for this year (Nov 10) and includes it otherwise (Jan 3, 2027) */
export function formatDate(ts: number, now = Date.now()): string {
  const d = new Date(ts)
  const md = `${d.getMonth() + 1}月${d.getDate()}日`
  return d.getFullYear() === new Date(now).getFullYear() ? md : `${d.getFullYear()}年${md}`
}
