/**
 * 背诵评测里的纯计算：对齐结果换算时间、规划录音切片、汇总分数。
 * 不碰网络和数据库，便于单独测试。
 */
import { SCORE_WEIGHTS } from '@shared/constants'
import type {
  AlignedSentence,
  Practice,
  PracticeScores,
  ScoredWord,
  SpokenWord,
} from '@shared/types'
import type { SoeMode, SoeResult } from './tencent/soe'

export interface SentenceMatch {
  index: number
  intended: string
  /** 对应识别结果里第几个词到第几个词（含两端）；没背出来为 null */
  wordRange: [number, number] | null
}

/**
 * 按大模型给出的词序号范围，换算每句原文在录音里的起止时间。
 * 范围越界或颠倒时视为没有对应；缺少的句子补成"没背出来"。
 */
export function mapSentenceTimings(
  matches: SentenceMatch[],
  words: SpokenWord[],
  sentenceCount: number,
): AlignedSentence[] {
  const byIndex = new Map(matches.map((m) => [m.index, m]))
  return Array.from({ length: sentenceCount }, (_, index) => {
    const m = byIndex.get(index)
    const range = m?.wordRange
    const valid =
      !!range &&
      range[0] >= 0 &&
      range[0] <= range[1] &&
      range[1] < words.length &&
      !!m?.intended.trim()
    if (!m || !valid)
      return { index, intended: valid ? (m?.intended ?? '') : '', startMs: 0, endMs: 0 }
    const first = words[range[0]]!
    const last = words[range[1]]!
    return {
      index,
      intended: m.intended.trim(),
      startMs: first.startMs,
      endMs: Math.max(last.endMs, first.startMs),
    }
  })
}

export interface Segment {
  sentenceIndex: number
  refText: string
  mode: SoeMode
  /** 切片在整段录音里的起止时间，前后各留一点余量 */
  startMs: number
  endMs: number
}

/** 句子模式最多 30 个词，超过的用段落模式（只有分数，没有音素和时间） */
const SENTENCE_MODE_MAX_WORDS = 30
/** 切片前后各多留一点，避免切掉首尾的音 */
const PADDING_MS = 150

export function planSegments(sentences: AlignedSentence[], durationMs: number): Segment[] {
  return sentences
    .filter((s) => s.intended && s.endMs > s.startMs)
    .map((s) => {
      const wordCount = s.intended.split(/\s+/).filter(Boolean).length
      return {
        sentenceIndex: s.index,
        refText: s.intended,
        mode: wordCount <= SENTENCE_MODE_MAX_WORDS ? 'sentence' : 'paragraph',
        startMs: Math.max(0, s.startMs - PADDING_MS),
        endMs: Math.min(durationMs || s.endMs + PADDING_MS, s.endMs + PADDING_MS),
      }
    })
}

/** 把一句的评测结果转成整段录音时间轴上的单词；段落模式没有时间，按词数平均分配 */
export function toScoredWords(segment: Segment, result: SoeResult): ScoredWord[] {
  const span = segment.endMs - segment.startMs
  const n = result.words.length
  return result.words.map((w, i) => {
    const hasTime = segment.mode === 'sentence' && w.endMs > w.startMs
    return {
      word: w.word || w.refWord,
      sentenceIndex: segment.sentenceIndex,
      startMs: hasTime ? segment.startMs + w.startMs : segment.startMs + Math.round((span * i) / n),
      endMs: hasTime
        ? segment.startMs + w.endMs
        : segment.startMs + Math.round((span * (i + 1)) / n),
      accuracy: w.accuracy,
      match: w.match,
      phones: w.phones,
    }
  })
}

/** 各句结果按词数加权汇总；返回值都是 0～1 或 0～100 的原始尺度 */
export function mergeResults(
  parts: { segment: Segment; result: SoeResult }[],
  unscored: number[] = [],
): NonNullable<Practice['pronunciation']> {
  const weight = (p: { result: SoeResult }) => Math.max(1, p.result.words.length)
  const total = parts.reduce((sum, p) => sum + weight(p), 0)
  const avg = (pick: (r: SoeResult) => number) =>
    total === 0 ? 0 : parts.reduce((sum, p) => sum + pick(p.result) * weight(p), 0) / total
  return {
    accuracy: avg((r) => r.accuracy),
    fluency: avg((r) => r.fluency),
    completeness: avg((r) => r.completeness),
    words: parts.flatMap((p) => toScoredWords(p.segment, p.result)),
    unscored,
  }
}

const clamp100 = (v: number) => Math.round(Math.min(100, Math.max(0, v)))

/** 四项分数和加权总分（发音 40%、流利度 20%、内容还原 25%、表达正确 15%） */
export function computeScores(
  alignment: NonNullable<Practice['alignment']>,
  pronunciation: NonNullable<Practice['pronunciation']>,
): PracticeScores {
  const scores = {
    pronunciation: clamp100(pronunciation.accuracy),
    fluency: clamp100(pronunciation.fluency * 100),
    content: clamp100(alignment.content),
    expression: clamp100(alignment.expression),
  }
  const overall =
    scores.pronunciation * SCORE_WEIGHTS.pronunciation +
    scores.fluency * SCORE_WEIGHTS.fluency +
    scores.content * SCORE_WEIGHTS.content +
    scores.expression * SCORE_WEIGHTS.expression
  return { overall: clamp100(overall), ...scores }
}

/** 报告里重点讲的单词：精准度最低的若干个（不含没说出来的） */
export function pickWeakWords(words: ScoredWord[], limit = 12, threshold = 75): ScoredWord[] {
  return words
    .filter((w) => w.accuracy >= 0 && w.accuracy < threshold && w.match !== 'missing')
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit)
}
