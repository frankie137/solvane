import { describe, expect, it } from 'vitest'
import type { TimedText } from '@shared/types'
import { activeTokenIndex, firstLetters, nextHint, scoreTone, tokenize } from './recite'

describe('tokenize', () => {
  it('splits on whitespace and records positions', () => {
    expect(tokenize("I'm  going hiking.")).toEqual([
      { text: "I'm", start: 0, end: 3 },
      { text: 'going', start: 5, end: 10 },
      { text: 'hiking.', start: 11, end: 18 },
    ])
  })
})

describe('firstLetters', () => {
  it.each([
    ['hiking.', 'h_____.'],
    ["I'm", "I'_"],
    ['"Hello,"', '"H____,"'],
    ['2024', '2024'],
    ['well-known', 'w___-k____'],
    ['don’t', 'd__’_'],
  ])('%s → %s', (word, expected) => {
    expect(firstLetters(word)).toBe(expected)
  })
})

describe('nextHint', () => {
  it('hidden → initials → full text → hidden', () => {
    expect([nextHint(0), nextHint(1), nextHint(2)]).toEqual([1, 2, 0])
  })
})

describe('activeTokenIndex', () => {
  const tokens = tokenize("I'm going hiking.")
  const words: TimedText[] = [
    { text: "I'm", beginMs: 0, endMs: 200, beginIndex: 0, endIndex: 2 },
    { text: 'going', beginMs: 250, endMs: 500, beginIndex: 4, endIndex: 8 },
    { text: 'hiking', beginMs: 520, endMs: 900, beginIndex: 10, endIndex: 15 },
    { text: '.', beginMs: 900, endMs: 950, beginIndex: 16, endIndex: 16 },
  ]

  it.each([
    [-10, -1],
    [0, 0],
    [220, 0],
    [300, 1],
    [600, 2],
    [920, 2],
  ])('%ims → word %i', (ms, index) => {
    expect(activeTokenIndex(tokens, words, ms)).toBe(index)
  })

  it('highlights nothing without timestamps', () => {
    expect(activeTokenIndex(tokens, [], 100)).toBe(-1)
  })
})

describe('scoreTone', () => {
  it.each([
    [95, 'good'],
    [85, 'good'],
    [70, 'fair'],
    [59, 'poor'],
    [-1, 'none'],
  ])('%i → %s', (score, tone) => {
    expect(scoreTone(score)).toBe(tone)
  })
})
