/** 歌词页和分享封面用到的纯函数 */

/** 当前播放到的句子：开始时间不晚于当前时间的最后一句；没有时间的句子跳过 */
export function currentLine(sentences: { startMs: number }[], positionMs: number): number {
  let current = -1
  for (const [i, s] of sentences.entries()) {
    if (s.startMs < 0) continue
    if (s.startMs <= positionMs) current = i
    else break
  }
  return current
}

/** 让某一行垂直居中需要的滚动位置；top 为这一行在滚动内容里的位置 */
export function centerScrollTop(top: number, height: number, viewport: number): number {
  return Math.max(0, Math.round(top + height / 2 - viewport / 2))
}

/** 0:07、1:23 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * 按宽度折行：英文按单词断，中文按字断；超过 maxLines 行时最后一行加省略号。
 * measure 返回一段文字的绘制宽度（画布上用 ctx.measureText）。
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
