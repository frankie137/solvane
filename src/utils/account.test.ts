import { describe, expect, it } from 'vitest'
import type { Account } from '@shared/types'
import { canUse, planLabel } from './account'

const NOW = new Date(2026, 9, 10).getTime()
const base: Account = {
  openid: 'o_me',
  isAdmin: false,
  pro: false,
  proUntil: null,
  freeUsed: 0,
  freeLeft: 5,
}

describe('planLabel', () => {
  it('管理员、Pro、免费三种状态', () => {
    expect(planLabel({ ...base, isAdmin: true, pro: true })).toBe('管理员 · 不限次数')
    expect(planLabel({ ...base, pro: true, proUntil: new Date(2026, 10, 10).getTime() }, NOW)).toBe(
      'Pro · 11月10日到期',
    )
    expect(planLabel({ ...base, freeUsed: 2, freeLeft: 3 })).toBe('免费体验 · 剩 3 次')
    expect(planLabel({ ...base, freeUsed: 5, freeLeft: 0 })).toBe('免费体验已用完')
  })

  it('Pro 过期后按免费次数显示', () => {
    expect(planLabel({ ...base, proUntil: 1, freeLeft: 1 })).toBe('免费体验 · 剩 1 次')
  })
})

describe('canUse', () => {
  it('还没取到状态时不拦，交给云端判断', () => {
    expect(canUse(null)).toBe(true)
    expect(canUse({ ...base, freeLeft: 0 })).toBe(false)
    expect(canUse({ ...base, freeLeft: 0, pro: true, proUntil: 1 })).toBe(true)
  })
})
