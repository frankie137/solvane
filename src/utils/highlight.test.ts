import { describe, expect, it } from 'vitest'
import { highlightPieces } from './highlight'
import { normalizeTag } from './tags'

describe('highlightPieces', () => {
  it('splits at expression positions and highlights inflected forms too', () => {
    expect(highlightPieces('We caught up yesterday.', 'catch up')).toEqual([
      { text: 'We ', hit: false },
      { text: 'caught up', hit: true },
      { text: ' yesterday.', hit: false },
    ])
  })

  it('leaves the whole sentence unhighlighted when not found', () => {
    expect(highlightPieces('Hello.', 'bye')).toEqual([{ text: 'Hello.', hit: false }])
  })
})

describe('normalizeTag', () => {
  it('strips # and extra whitespace, and reports why when too long', () => {
    expect(normalizeTag(' #旅行  计划 ')).toEqual({ tag: '旅行 计划' })
    expect(normalizeTag('#')).toEqual({ error: '标签不能为空' })
    expect(normalizeTag('一二三四五六七八九十一二三')).toEqual({ error: '标签最多 12 个字' })
  })
})
