import { describe, expect, it } from 'vitest'
import { centerScrollTop, currentLine, formatClock, wrapText } from './lyrics'

describe('currentLine', () => {
  const lines = [{ startMs: 500 }, { startMs: -1 }, { startMs: 2000 }, { startMs: 4000 }]

  it('has no current line before the start, then picks the last line that has started', () => {
    expect(currentLine(lines, 0)).toBe(-1)
    expect(currentLine(lines, 500)).toBe(0)
    expect(currentLine(lines, 1999)).toBe(0)
    expect(currentLine(lines, 2500)).toBe(2)
    expect(currentLine(lines, 9999)).toBe(3)
  })

  it('never makes an unrecited sentence the current line', () => {
    expect(currentLine([{ startMs: -1 }, { startMs: -1 }], 1000)).toBe(-1)
  })
})

describe('centerScrollTop', () => {
  it('centers the line and never goes below 0', () => {
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
  // Every character is 10 wide
  const measure = (s: string) => s.length * 10

  it('wraps English at word boundaries', () => {
    expect(wrapText("I'm at work right now.", 100, 3, measure)).toEqual([
      "I'm at",
      'work right',
      'now.',
    ])
  })

  it('wraps Chinese at any character', () => {
    expect(wrapText('周六还在上班真辛苦', 40, 3, measure)).toEqual(['周六还在', '上班真辛', '苦'])
  })

  it('adds an ellipsis to the last line when there are too many lines', () => {
    const lines = wrapText('one two three four five six', 90, 2, measure)
    expect(lines).toHaveLength(2)
    expect(lines[1]!.endsWith('…')).toBe(true)
    expect(measure(lines[1]!)).toBeLessThanOrEqual(90)
  })
})
