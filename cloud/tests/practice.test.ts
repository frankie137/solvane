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
  it('converts word indexes to timings and fills missing sentences as not recited', () => {
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

  it('counts punctuation right before a sentence as its start', () => {
    const withDot: SpokenWord[] = [
      { word: 'out', startMs: 2440, endMs: 2740 },
      { word: '.', startMs: 3140, endMs: 3515 },
      { word: "I'mat", startMs: 3515, endMs: 3640 },
      { word: 'work', startMs: 3640, endMs: 3865 },
    ]
    const [, s] = mapSentenceTimings(
      [
        { index: 0, intended: 'Test this out.', wordRange: [0, 0] },
        { index: 1, intended: "I'm at work.", wordRange: [2, 3] },
      ],
      withDot,
      2,
    )
    expect(s).toMatchObject({ startMs: 3140, endMs: 3865 })
  })

  it.each([
    ['out of bounds', [3, 9] as [number, number]],
    ['reversed', [2, 1] as [number, number]],
    ['negative', [-1, 1] as [number, number]],
  ])('treats a range that is %s as unmatched', (_name, range) => {
    const [s] = mapSentenceTimings([{ index: 0, intended: 'x', wordRange: range }], words, 1)
    expect(s).toEqual({ index: 0, intended: '', startMs: 0, endMs: 0 })
  })
})

describe('planSegments', () => {
  it('skips unrecited sentences and extends into pauses without crossing neighboring sentences', () => {
    const segs = planSegments(
      [
        { index: 0, intended: "I'm going hiking.", startMs: 100, endMs: 1000 },
        { index: 1, intended: '', startMs: 0, endMs: 0 },
        { index: 2, intended: 'See you.', startMs: 1500, endMs: 1900 },
      ],
      1950,
    )
    expect(segs).toEqual([
      { sentenceIndex: 0, refText: "I'm going hiking.", mode: 'sentence', startMs: 0, endMs: 1250 },
      { sentenceIndex: 2, refText: 'See you.', mode: 'sentence', startMs: 1250, endMs: 1950 },
    ])
  })

  it('extends only a fixed margin into long pauses, and the last sentence up to the end of the recording', () => {
    const segs = planSegments(
      [
        { index: 0, intended: 'Hi there.', startMs: 1000, endMs: 2000 },
        { index: 1, intended: 'See you.', startMs: 6000, endMs: 7000 },
      ],
      7300,
    )
    expect(segs.map((s) => [s.startMs, s.endMs])).toEqual([
      [600, 2800],
      [5600, 7300],
    ])
  })

  it('switches to paragraph mode above 30 words', () => {
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
  it('restores word casing from the source sentence and leaves unmatched words as is', () => {
    const seg = {
      sentenceIndex: 0,
      refText: "Ah, I'm at work — today's Saturday.",
      mode: 'sentence' as const,
      startMs: 0,
      endMs: 3000,
    }
    const soe = result(80, 1, 5)
    soe.words = ['ah', "i'm", 'at', 'home', 'saturday'].map((word, i) => ({
      ...soe.words[i]!,
      word,
      refWord: word,
    }))
    expect(toScoredWords(seg, soe).map((w) => w.word)).toEqual([
      'Ah',
      "I'm",
      'at',
      'home',
      'Saturday',
    ])
  })

  it('offsets sentence-mode timings by the segment start', () => {
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

  it('splits time evenly by word count in paragraph mode', () => {
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

  it('aggregates weighted by word count', () => {
    const seg = { sentenceIndex: 0, refText: 'x', mode: 'sentence' as const, startMs: 0, endMs: 1 }
    const merged = mergeResults([
      { segment: seg, result: result(90, 1, 3) },
      { segment: { ...seg, sentenceIndex: 1 }, result: result(50, 0.5, 1) },
    ])
    expect(merged.accuracy).toBe(80)
    expect(merged.fluency).toBeCloseTo(0.875)
    expect(merged.words).toHaveLength(4)
  })

  it('returns all zeros when there are no segments', () => {
    expect(mergeResults([])).toEqual({
      accuracy: 0,
      fluency: 0,
      completeness: 0,
      words: [],
      unscored: [],
    })
  })
})

describe('computeScores', () => {
  it('weights the four scores into the overall score', () => {
    const scores = computeScores(
      { sentences: [], diffs: [], content: 80, expression: 90 },
      { accuracy: 70, fluency: 0.9, completeness: 1, words: [], unscored: [] },
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

  it('clamps out-of-range values to 0-100', () => {
    const scores = computeScores(
      { sentences: [], diffs: [], content: 120, expression: -5 },
      { accuracy: 101, fluency: 1.2, completeness: 1, words: [], unscored: [] },
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

  it('picks the lowest-accuracy words, excluding missing and unassessable ones', () => {
    const weak = pickWeakWords(
      [w('a', 90), w('b', 40), w('c', 60), w('d', -1), w('e', 10, 'missing')],
      2,
    )
    expect(weak.map((x) => x.word)).toEqual(['b', 'c'])
  })
})
