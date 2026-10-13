import type { TimedText } from '@shared/types'

/** A word in a sentence and its character range in the original text */
export interface Token {
  text: string
  start: number
  end: number
}

/** Split on whitespace, keeping each word's position in the original text to match against TTS timestamps */
export function tokenize(sentence: string): Token[] {
  const tokens: Token[] = []
  for (const m of sentence.matchAll(/\S+/g)) {
    const start = m.index ?? 0
    tokens.push({ text: m[0], start, end: start + m[0].length })
  }
  return tokens
}

/** Three recitation hint levels: 0 hides everything, 1 shows only initials, 2 shows the full text */
export type HintLevel = 0 | 1 | 2

/**
 * Initials hint: keep only each word's first letter, replace the other letters with underscores, and keep punctuation.
 * Parts after a hyphen also keep their initial (well-known → w___-k____); apostrophes don't split words (I'm → I'_).
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
 * Which word to highlight at positionMs.
 * Uses the character ranges returned by TTS to find the word; during a pause between two words, keep the previous one.
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
  // When character ranges don't line up (e.g. punctuation as its own segment), take the nearest word before the start
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i]!.start <= at) return i
  }
  return -1
}

export type ScoreTone = 'good' | 'fair' | 'poor' | 'none'

/** Word coloring: green at 85 and above, yellow for 60–85, red below 60; no color when it couldn't be assessed */
export function scoreTone(accuracy: number): ScoreTone {
  if (accuracy < 0) return 'none'
  if (accuracy >= 85) return 'good'
  if (accuracy >= 60) return 'fair'
  return 'poor'
}
