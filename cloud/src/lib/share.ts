import { tokenizeWords } from '@shared/expression'
import type {
  AlignedSentence,
  ScoredWord,
  SentencePair,
  ShareSentence,
  SpokenWord,
  TimedText,
} from '@shared/types'

/**
 * A timed word that knows which sentence it belongs to: from the assessment result if scored,
 * from the transcript otherwise
 */
export type SentenceWord = Pick<ScoredWord, 'word' | 'sentenceIndex' | 'startMs' | 'endMs'> & {
  match?: ScoredWord['match']
}

/** Max source words to skip ahead when matching an assessed word (for skipped or extra words) */
const LOOKAHEAD = 3

const normalize = (word: string) =>
  word
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')

/**
 * Maps assessed word timings onto the source sentence's words (character positions follow the
 * source), matching greedily in order. Paraphrased or skipped words that don't match are passed
 * over, and the corresponding words don't light up.
 */
export function mapWordTimings(sentence: string, words: SentenceWord[]): TimedText[] {
  const tokens = tokenizeWords(sentence)
  const timed = words
    .filter((w) => w.match !== 'missing' && w.match !== 'extra' && w.endMs > w.startMs)
    .sort((a, b) => a.startMs - b.startMs)
  const out: TimedText[] = []
  let next = 0
  for (const w of timed) {
    const target = normalize(w.word)
    if (!target) continue
    for (let k = next; k < Math.min(tokens.length, next + LOOKAHEAD + 1); k++) {
      const t = tokens[k]!
      if (t.word !== target) continue
      out.push({
        text: sentence.slice(t.start, t.end),
        beginMs: w.startMs,
        endMs: w.endMs,
        beginIndex: t.start,
        endIndex: t.end,
      })
      next = k + 1
      break
    }
  }
  return out
}

/**
 * Unscored recordings have no per-word assessment timings: assign transcript words to sentences
 * by their time ranges. A word belongs to the sentence whose range contains its midpoint; words
 * between sentences (noise in pauses, extra speech) are dropped.
 */
export function wordsFromTranscript(
  words: SpokenWord[],
  aligned: AlignedSentence[],
): SentenceWord[] {
  const spoken = aligned.filter((a) => a.intended && a.endMs > a.startMs)
  return words.flatMap((w) => {
    const mid = (w.startMs + w.endMs) / 2
    const s = spoken.find((a) => mid >= a.startMs && mid <= a.endMs)
    return s ? [{ word: w.word, sentenceIndex: s.index, startMs: w.startMs, endMs: w.endMs }] : []
  })
}

/** Sentences in a share snapshot: source text + this recitation's sentence and per-word timings */
export function buildShareSentences(
  sentences: SentencePair[],
  aligned: AlignedSentence[],
  words: SentenceWord[],
): ShareSentence[] {
  return sentences.map((s, i) => {
    const a = aligned.find((x) => x.index === i)
    const recited = !!a && !!a.intended && a.endMs > a.startMs
    return {
      en: s.en,
      zh: s.zh,
      startMs: recited ? a.startMs : -1,
      endMs: recited ? a.endMs : -1,
      words: recited
        ? mapWordTimings(
            s.en,
            words.filter((w) => w.sentenceIndex === i),
          )
        : [],
    }
  })
}
