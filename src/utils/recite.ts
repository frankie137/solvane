import type { TimedText } from '@shared/types'

/** 句子里的一个词和它在原文中的字符范围 */
export interface Token {
  text: string
  start: number
  end: number
}

/** 按空白切词，保留每个词在原文里的位置，用于和语音合成的时间戳对应 */
export function tokenize(sentence: string): Token[] {
  const tokens: Token[] = []
  for (const m of sentence.matchAll(/\S+/g)) {
    const start = m.index ?? 0
    tokens.push({ text: m[0], start, end: start + m[0].length })
  }
  return tokens
}

/** 背诵提示的三级：0 全部遮住、1 只露首字母、2 显示原文 */
export type HintLevel = 0 | 1 | 2

/**
 * 首字母提示：每个词只保留第一个字母，其余字母换成下划线，标点保留。
 * 连字符后面的部分也保留首字母（well-known → w___-k____）；撇号不算分隔（I'm → I'_）。
 */
export function firstLetters(word: string): string {
  let seenLetter = false
  return [...word]
    .map((ch) => {
      if (!/[A-Za-z]/.test(ch)) {
        if (ch !== "'" && ch !== '’') seenLetter = false
        return ch
      }
      if (seenLetter) return '_'
      seenLetter = true
      return ch
    })
    .join('')
}

export function nextHint(level: HintLevel): HintLevel {
  return level === 2 ? 0 : ((level + 1) as HintLevel)
}

/**
 * 播放到 positionMs 时应该高亮第几个词。
 * 用语音合成返回的字符范围找到对应的词；在两个词之间的停顿时保持上一个词。
 */
export function activeTokenIndex(tokens: Token[], words: TimedText[], positionMs: number): number {
  let current: TimedText | undefined
  for (const w of words) {
    if (w.beginMs <= positionMs) current = w
    else break
  }
  if (!current) return -1
  const at = current.beginIndex
  const index = tokens.findIndex((t) => at >= t.start && at < t.end)
  if (index !== -1) return index
  // 字符范围对不上（例如标点单独成段）时，取起点之前最近的词
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i]!.start <= at) return i
  }
  return -1
}

export type ScoreTone = 'good' | 'fair' | 'poor' | 'none'

/** 单词着色：85 分以上绿、60～85 黄、60 以下红；无法评测时不着色 */
export function scoreTone(accuracy: number): ScoreTone {
  if (accuracy < 0) return 'none'
  if (accuracy >= 85) return 'good'
  if (accuracy >= 60) return 'fair'
  return 'poor'
}
