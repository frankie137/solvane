import type { Account } from '@shared/types'
import { formatDate } from './time'

/** One-line membership status, shared by the Me tab card, the Pro sheet and the membership admin list */
export function planLabel(account: Account, now = Date.now()): string {
  if (account.isAdmin) return '管理员 · 不限次数'
  if (account.pro && account.proUntil !== null) {
    return `Pro · ${formatDate(account.proUntil, now)}到期`
  }
  if (account.freeLeft === 0) return '免费体验已用完'
  return `免费体验 · 剩 ${account.freeLeft} 次`
}

/** Whether the user can still start a new session or scoring */
export function canUse(account: Account | null): boolean {
  return !account || account.pro || account.freeLeft > 0
}
