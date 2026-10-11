import type { Account } from '@shared/types'
import { formatDate } from './time'

/** 会员状态的一句话：「我的」页卡片、Pro 面板、会员管理列表共用 */
export function planLabel(account: Account, now = Date.now()): string {
  if (account.isAdmin) return '管理员 · 不限次数'
  if (account.pro && account.proUntil !== null) {
    return `Pro · ${formatDate(account.proUntil, now)}到期`
  }
  if (account.freeLeft === 0) return '免费体验已用完'
  return `免费体验 · 剩 ${account.freeLeft} 次`
}

/** 还能不能发起新对话或评分 */
export function canUse(account: Account | null): boolean {
  return !account || account.pro || account.freeLeft > 0
}
