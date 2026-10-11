import { PRO } from './constants'

const DAY_MS = 24 * 60 * 60 * 1000

/** 开通一次后的到期时间：没开通或已过期的从现在起算，还没到期的在到期时间上往后加 */
export function extendedUntil(proUntil: number | null, now: number): number {
  return Math.max(proUntil ?? 0, now) + PRO.grantDays * DAY_MS
}
