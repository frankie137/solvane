const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** 列表里用的相对时间：刚刚 / 5 分钟前 / 3 小时前 / 昨天 / 10月8日 / 2025年10月8日 */
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

/** 日期：今年的省略年份（11月10日），其他年份带上（2027年1月3日） */
export function formatDate(ts: number, now = Date.now()): string {
  const d = new Date(ts)
  const md = `${d.getMonth() + 1}月${d.getDate()}日`
  return d.getFullYear() === new Date(now).getFullYear() ? md : `${d.getFullYear()}年${md}`
}
