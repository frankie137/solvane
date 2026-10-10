import { findOccurrence } from '@shared/expression'

export interface Piece {
  text: string
  hit: boolean
}

/** 把句子按表达出现的位置切成几段，用于高亮；找不到时整句一段 */
export function highlightPieces(sentence: string, phrase: string): Piece[] {
  const o = findOccurrence(sentence, phrase)
  if (!o) return [{ text: sentence, hit: false }]
  return [
    { text: sentence.slice(0, o.start), hit: false },
    { text: sentence.slice(o.start, o.end), hit: true },
    { text: sentence.slice(o.end), hit: false },
  ].filter((p) => p.text)
}
