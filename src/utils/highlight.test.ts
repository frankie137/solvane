import { describe, expect, it } from 'vitest'
import { highlightPieces } from './highlight'
import { normalizeTag } from './tags'

describe('highlightPieces', () => {
  it('按表达位置切分，词形变化也能高亮', () => {
    expect(highlightPieces('We caught up yesterday.', 'catch up')).toEqual([
      { text: 'We ', hit: false },
      { text: 'caught up', hit: true },
      { text: ' yesterday.', hit: false },
    ])
  })

  it('找不到时整句不高亮', () => {
    expect(highlightPieces('Hello.', 'bye')).toEqual([{ text: 'Hello.', hit: false }])
  })
})

describe('normalizeTag', () => {
  it('去掉 # 和多余空白，超长报原因', () => {
    expect(normalizeTag(' #旅行  计划 ')).toEqual({ tag: '旅行 计划' })
    expect(normalizeTag('#')).toEqual({ error: '标签不能为空' })
    expect(normalizeTag('一二三四五六七八九十一二三')).toEqual({ error: '标签最多 12 个字' })
  })
})
