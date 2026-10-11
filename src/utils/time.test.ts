import { describe, expect, it } from 'vitest'
import { formatDate, formatRelative } from './time'

const NOW = new Date(2026, 9, 9, 15, 0, 0).getTime()

describe('formatRelative', () => {
  it.each([
    [NOW - 10_000, '刚刚'],
    [NOW - 5 * 60_000, '5 分钟前'],
    [NOW - 3 * 3_600_000, '3 小时前'],
    [new Date(2026, 9, 8, 23, 0).getTime(), '昨天'],
    [new Date(2026, 9, 1, 9, 0).getTime(), '10月1日'],
    [new Date(2025, 11, 31, 9, 0).getTime(), '2025年12月31日'],
  ])('%i → %s', (ts, text) => {
    expect(formatRelative(ts, NOW)).toBe(text)
  })
})

describe('formatDate', () => {
  it('今年的省略年份，其他年份带上', () => {
    expect(formatDate(new Date(2026, 10, 10, 8, 0).getTime(), NOW)).toBe('11月10日')
    expect(formatDate(new Date(2027, 0, 3).getTime(), NOW)).toBe('2027年1月3日')
  })
})
