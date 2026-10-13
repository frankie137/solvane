import { PRO } from './constants'

const DAY_MS = 24 * 60 * 60 * 1000

/** Expiry after one grant: counted from now if never granted or already expired, otherwise added to the current expiry */
export function extendedUntil(proUntil: number | null, now: number): number {
  return Math.max(proUntil ?? 0, now) + PRO.grantDays * DAY_MS
}
