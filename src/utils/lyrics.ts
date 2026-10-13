/** Pure functions used by the lyrics player and the share cover */

/** The sentence now playing: the last one starting no later than the current time; sentences without timings are skipped */
export function currentLine(sentences: { startMs: number }[], positionMs: number): number {
  let current = -1
  for (const [i, s] of sentences.entries()) {
    if (s.startMs < 0) continue
    if (s.startMs <= positionMs) current = i
    else break
  }
  return current
}

/** Scroll position that vertically centers a line; top is the line's position within the scroll content */
export function centerScrollTop(top: number, height: number, viewport: number): number {
  return Math.max(0, Math.round(top + height / 2 - viewport / 2))
}

/** 0:07, 1:23 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * Wrap text to a width: English breaks at words, Chinese at any character; past maxLines the last line gets an ellipsis.
 * measure returns the rendered width of a piece of text (ctx.measureText on a canvas).
 */
export function wrapText(
  text: string,
  maxWidth: number,
  maxLines: number,
  measure: (s: string) => number,
): string[] {
  const units = text.match(/[A-Za-z0-9'’,.!?;:-]+\s*|\s+|./gu) ?? []
  const lines: string[] = []
  let line = ''
  for (const unit of units) {
    const next = line + unit
    if (line && measure(next.trimEnd()) > maxWidth) {
      lines.push(line.trimEnd())
      line = unit.trimStart()
    } else {
      line = next
    }
  }
  if (line.trim()) lines.push(line.trimEnd())
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]!
  while (last && measure(`${last}…`) > maxWidth) last = last.slice(0, -1)
  kept[maxLines - 1] = `${last.trimEnd()}…`
  return kept
}
