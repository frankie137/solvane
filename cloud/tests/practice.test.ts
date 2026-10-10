import { describe, expect, it } from 'vitest'
import type { ScoredWord, SpokenWord } from '@shared/types'
import {
  computeScores,
  mapSentenceTimings,
  mergeResults,
  pickWeakWords,
  planSegments,
  toScoredWords,
} from '../src/lib/practice'
import type { SoeResult } from '../src/lib/tencent/soe'

const words: SpokenWord[] = [
  { word: "I'm", startMs: 100, endMs: 300 },
  { word: 'going', startMs: 300, endMs: 600 },
  { word: 'hiking', startMs: 600, endMs: 1000 },
  { word: 'see', startMs: 1500, endMs: 1700 },
  { word: 'you', startMs: 1700, endMs: 1900 },
]

describe('mapSentenceTimings', () => {
  it('按词序号换算时间，缺少的句子补成没背出来', () => {
    const r = mapSentenceTimings(
      [
        { index: 0, intended: "I'm going hiking.", wordRange: [0, 2] },
        { index: 2, intended: 'See you.', wordRange: [3, 4] },
      ],
      words,
      3,
    )
    expect(r).toEqual([
      { index: 0, intended: "I'm going hiking.", startMs: 100, endMs: 1000 },
      { index: 1, intended: '', startMs: 0, endMs: 0 },
      { index: 2, intended: 'See you.', startMs: 1500, endMs: 1900 },
    ])
  })

  it.each([
    ['越界', [3, 9] as [number, number]],
    ['颠倒', [2, 1] as [number, number]],
    ['负数', [-1, 1] as [number, number]],
  ])('范围%s时视为没有对应', (_name, range) => {
    const [s] = mapSentenceTimings([{ index: 0, intended: 'x', wordRange: range }], words, 1)
    expect(s).toEqual({ index: 0, intended: '', startMs: 0, endMs: 0 })
  })
})

describe('planSegments', () => {
  it('跳过没背出来的句子，前后留余量且不超出录音', () => {
    const segs = planSegments(
      [
        { index: 0, intended: "I'm going hiking.", startMs: 100, endMs: 1000 },
        { index: 1, intended: '', startMs: 0, endMs: 0 },
        { index: 2, intended: 'See you.', startMs: 1500, endMs: 1900 },
      ],
      1950,
    )
    expect(segs).toEqual([
      { sentenceIndex: 0, refText: "I'm going hiking.", mode: 'sentence', startMs: 0, endMs: 1150 },
      { sentenceIndex: 2, refText: 'See you.', mode: 'sentence', startMs: 1350, endMs: 1950 },
    ])
  })

  it('超过 30 个词改用段落模式', () => {
    const long = Array.from({ length: 31 }, () => 'word').join(' ')
    const [seg] = planSegments([{ index: 0, intended: long, startMs: 0, endMs: 9000 }], 9000)
    expect(seg!.mode).toBe('paragraph')
  })
})

const result = (accuracy: number, fluency: number, n: number): SoeResult => ({
  accuracy,
  fluency,
  completeness: 1,
  words: Array.from({ length: n }, (_, i) => ({
    word: `w${i}`,
    refWord: `w${i}`,
    startMs: i * 100,
    endMs: i * 100 + 80,
    accuracy,
    match: 'ok' as const,
    phones: [],
  })),
})

describe('toScoredWords / mergeResults', () => {
  it('句子模式的时间加上切片起点', () => {
    const seg = {
      sentenceIndex: 1,
      refText: 'x',
      mode: 'sentence' as const,
      startMs: 1000,
      endMs: 2000,
    }
    const [w] = toScoredWords(seg, result(80, 1, 1))
    expect(w).toMatchObject({ sentenceIndex: 1, startMs: 1000, endMs: 1080 })
  })

  it('段落模式按词数平均分配时间', () => {
    const seg = {
      sentenceIndex: 0,
      refText: 'x',
      mode: 'paragraph' as const,
      startMs: 0,
      endMs: 1000,
    }
    const ws = toScoredWords(seg, result(80, 1, 4))
    expect(ws.map((w) => [w.startMs, w.endMs])).toEqual([
      [0, 250],
      [250, 500],
      [500, 750],
      [750, 1000],
    ])
  })

  it('按词数加权汇总', () => {
    const seg = { sentenceIndex: 0, refText: 'x', mode: 'sentence' as const, startMs: 0, endMs: 1 }
    const merged = mergeResults([
      { segment: seg, result: result(90, 1, 3) },
      { segment: { ...seg, sentenceIndex: 1 }, result: result(50, 0.5, 1) },
    ])
    expect(merged.accuracy).toBe(80)
    expect(merged.fluency).toBeCloseTo(0.875)
    expect(merged.words).toHaveLength(4)
  })

  it('没有任何片段时全部为 0', () => {
    expect(mergeResults([])).toEqual({ accuracy: 0, fluency: 0, completeness: 0, words: [] })
  })
})

describe('computeScores', () => {
  it('四项加权得到总分', () => {
    const scores = computeScores(
      { sentences: [], diffs: [], content: 80, expression: 90 },
      { accuracy: 70, fluency: 0.9, completeness: 1, words: [] },
    )
    // 70×0.4 + 90×0.2 + 80×0.25 + 90×0.15 = 79.5
    expect(scores).toEqual({
      overall: 80,
      pronunciation: 70,
      fluency: 90,
      content: 80,
      expression: 90,
    })
  })

  it('超出范围的值被限制在 0～100', () => {
    const scores = computeScores(
      { sentences: [], diffs: [], content: 120, expression: -5 },
      { accuracy: 101, fluency: 1.2, completeness: 1, words: [] },
    )
    expect(scores).toMatchObject({ pronunciation: 100, fluency: 100, content: 100, expression: 0 })
  })
})

describe('pickWeakWords', () => {
  const w = (word: string, accuracy: number, match: ScoredWord['match'] = 'ok'): ScoredWord => ({
    word,
    sentenceIndex: 0,
    startMs: 0,
    endMs: 1,
    accuracy,
    match,
    phones: [],
  })

  it('取精准度最低的，排除没说出来和无法评测的', () => {
    const weak = pickWeakWords(
      [w('a', 90), w('b', 40), w('c', 60), w('d', -1), w('e', 10, 'missing')],
      2,
    )
    expect(weak.map((x) => x.word)).toEqual(['b', 'c'])
  })
})
