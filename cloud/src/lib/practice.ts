/**
 * Pure computation for recitation assessment: converting alignment to timings, planning
 * recording segments, aggregating scores.
 * No network or database access, so it can be tested on its own.
 */
import { SCORE_WEIGHTS } from '@shared/constants'
import type {
  AlignedSentence,
  Practice,
  PracticeScores,
  PracticeStage,
  ScoredWord,
  SpokenWord,
} from '@shared/types'
import type { SoeMode, SoeResult } from './tencent/soe'

const STAGE_ORDER: PracticeStage[] = ['transcribe', 'align', 'score', 'report', 'done']

/**
 * How far a practice should be processed: scored ones run every stage; ones that only need lyric
 * timings for sharing finish alignment and stop before score; recording-only ones do nothing.
 * Practices from before M6 have no flags and are all scored.
 */
export function practiceGoal(flags: {
  scoreRequested?: boolean
  timingRequested?: boolean
}): PracticeStage {
  if (flags.scoreRequested ?? true) return 'done'
  if (flags.timingRequested) return 'score'
  return 'transcribe'
}

/** Whether the current stage has reached the goal (every stage before the goal is done) */
export function reachedStage(stage: PracticeStage, goal: PracticeStage): boolean {
  return STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(goal)
}

export interface SentenceMatch {
  index: number
  intended: string
  /** Range of word indexes in the transcript (inclusive); null if the sentence wasn't recited */
  wordRange: [number, number] | null
}

/**
 * Converts the LLM's word index ranges into each source sentence's start and end time in the
 * recording. Out-of-bounds or reversed ranges count as unmatched; missing sentences are filled in
 * as "not recited".
 */
const isPunctuation = (word: string) => !/[\p{L}\p{N}]/u.test(word)

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
    // Standalone punctuation in the transcript also has timings and often overlaps the next
    // sentence's opening speech: punctuation right before a sentence counts as its start
    let start = range[0]
    while (start > 0 && isPunctuation(words[start - 1]!.word)) start--
    const first = words[start]!
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
  /** Segment start and end within the full recording, with a little padding on each side */
  startMs: number
  endMs: number
}

/**
 * Sentence mode takes up to 30 words; longer ones use paragraph mode (scores only, no phonemes
 * or timings)
 */
const SENTENCE_MODE_MAX_WORDS = 30
/**
 * ASR word timings are imprecise, and sentence ends tend to come early: segments extend into the
 * surrounding pauses, but no further than the midpoint of the pause next to a neighboring
 * sentence, so they don't cut into it
 */
const LEAD_MS = 400
const TAIL_MS = 800

export function planSegments(sentences: AlignedSentence[], durationMs: number): Segment[] {
  const spoken = sentences
    .filter((s) => s.intended && s.endMs > s.startMs)
    .sort((a, b) => a.startMs - b.startMs)
  return spoken.map((s, i) => {
    const prev = spoken[i - 1]
    const next = spoken[i + 1]
    const wordCount = s.intended.split(/\s+/).filter(Boolean).length
    const lead = s.startMs - LEAD_MS
    const tail = s.endMs + TAIL_MS
    return {
      sentenceIndex: s.index,
      refText: s.intended,
      mode: wordCount <= SENTENCE_MODE_MAX_WORDS ? 'sentence' : 'paragraph',
      startMs: Math.round(Math.max(0, lead, prev ? (prev.endMs + s.startMs) / 2 : 0)),
      endMs: Math.round(
        Math.min(tail, next ? (s.endMs + next.startMs) / 2 : durationMs > 0 ? durationMs : tail),
      ),
    }
  })
}

/** Assessment returns lowercase words: match them in order to the source to restore casing */
function restoreCase(refText: string, words: string[]): string[] {
  const tokens = refText
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, ''))
    .filter(Boolean)
  let j = 0
  return words.map((w) => {
    for (let k = j; k < tokens.length; k++) {
      if (tokens[k]!.toLowerCase() === w.toLowerCase()) {
        j = k + 1
        return tokens[k]!
      }
    }
    return w
  })
}

/**
 * Converts one sentence's assessment result into words on the full recording's timeline;
 * paragraph mode has no timings, so time is split evenly by word count
 */
export function toScoredWords(segment: Segment, result: SoeResult): ScoredWord[] {
  const span = segment.endMs - segment.startMs
  const n = result.words.length
  const display = restoreCase(
    segment.refText,
    result.words.map((w) => w.word || w.refWord),
  )
  return result.words.map((w, i) => {
    const hasTime = segment.mode === 'sentence' && w.endMs > w.startMs
    return {
      word: display[i]!,
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

/** Aggregates per-sentence results weighted by word count; values keep raw 0-1 or 0-100 scales */
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

/**
 * The four scores and the weighted overall score (pronunciation 40%, fluency 20%,
 * content fidelity 25%, expression accuracy 15%)
 */
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

/** Words the report focuses on: the lowest-accuracy ones (excluding words that weren't said) */
export function pickWeakWords(words: ScoredWord[], limit = 12, threshold = 75): ScoredWord[] {
  return words
    .filter((w) => w.accuracy >= 0 && w.accuracy < threshold && w.match !== 'missing')
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit)
}
