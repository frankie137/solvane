import { describe, expect, it } from 'vitest'
import { centerScrollTop, currentLine, formatClock, wrapText } from './lyrics'

describe('currentLine', () => {
  const lines = [{ startMs: 500 }, { startMs: -1 }, { startMs: 2000 }, { startMs: 4000 }]

  it('开始前没有当前句，之后取最后一句已开始的', () => {
    expect(currentLine(lines, 0)).toBe(-1)
    expect(currentLine(lines, 500)).toBe(0)
    expect(currentLine(lines, 1999)).toBe(0)
    expect(currentLine(lines, 2500)).toBe(2)
    expect(currentLine(lines, 9999)).toBe(3)
  })

  it('没背出来的句子不会成为当前句', () => {
    expect(currentLine([{ startMs: -1 }, { startMs: -1 }], 1000)).toBe(-1)
  })
})

describe('centerScrollTop', () => {
  it('让这一行居中，不小于 0', () => {
    expect(centerScrollTop(800, 60, 600)).toBe(530)
    expect(centerScrollTop(100, 60, 600)).toBe(0)
  })
})

describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [7_400, '0:07'],
    [83_000, '1:23'],
    [-5, '0:00'],
  ])('%d → %s', (ms, text) => {
    expect(formatClock(ms)).toBe(text)
  })
})

describe('wrapText', () => {
  // 每个字符宽 10
  const measure = (s: string) => s.length * 10

  it('英文按单词折行', () => {
    expect(wrapText("I'm at work right now.", 100, 3, measure)).toEqual([
      "I'm at",
      'work right',
      'now.',
    ])
  })

  it('中文按字折行', () => {
    expect(wrapText('周六还在上班真辛苦', 40, 3, measure)).toEqual(['周六还在', '上班真辛', '苦'])
  })

  it('超过行数时最后一行加省略号', () => {
    const lines = wrapText('one two three four five six', 90, 2, measure)
    expect(lines).toHaveLength(2)
    expect(lines[1]!.endsWith('…')).toBe(true)
    expect(measure(lines[1]!)).toBeLessThanOrEqual(90)
  })
})
