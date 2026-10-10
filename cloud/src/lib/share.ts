import { tokenizeWords } from '@shared/expression'
import type {
  AlignedSentence,
  ScoredWord,
  SentencePair,
  ShareSentence,
  TimedText,
} from '@shared/types'

/** 评测单词往后最多跳过几个原句的词去找对应（中间有漏读或多读时） */
const LOOKAHEAD = 3

const normalize = (word: string) =>
  word
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')

/**
 * 把评测得到的单词时间对到原句的词上（字符位置以原句为准），按顺序贪心匹配。
 * 换了说法、漏读的词对不上就跳过，对应的词不点亮。
 */
export function mapWordTimings(sentence: string, words: ScoredWord[]): TimedText[] {
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

/** 分享快照里的句子：原文 + 这次背诵的句子时间和逐词时间 */
export function buildShareSentences(
  sentences: SentencePair[],
  aligned: AlignedSentence[],
  words: ScoredWord[],
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
