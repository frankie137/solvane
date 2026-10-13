import { findOccurrence } from '@shared/expression'

export interface Piece {
  text: string
  hit: boolean
}

/** Split a sentence where the expression appears, for highlighting; the whole sentence is one piece if not found */
export function highlightPieces(sentence: string, phrase: string): Piece[] {
  const o = findOccurrence(sentence, phrase)
  if (!o) return [{ text: sentence, hit: false }]
  return [
    { text: sentence.slice(0, o.start), hit: false },
    { text: sentence.slice(o.start, o.end), hit: true },
    { text: sentence.slice(o.end), hit: false },
  ].filter((p) => p.text)
}
