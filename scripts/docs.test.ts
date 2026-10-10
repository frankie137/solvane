import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..')
const docs = [
  'README.md',
  'CLAUDE.md',
  'docs/REVIEW.md',
  ...readdirSync(join(root, 'docs/stages')).map((f) => `docs/stages/${f}`),
]

/** 代码块里的内容不检查 */
function proseLines(text: string): { line: string; no: number }[] {
  let inCode = false
  return text.split('\n').flatMap((line, i) => {
    if (line.trimStart().startsWith('```')) {
      inCode = !inCode
      return []
    }
    return inCode ? [] : [{ line, no: i + 1 }]
  })
}

describe.each(docs)('%s', (file) => {
  const text = readFileSync(join(root, file), 'utf8')

  // 整节替换时如果把表格分隔行当成章节分隔线，会留下半截表格（M2 时在 README 里发现过）
  it('没有残缺的表格行', () => {
    const broken = proseLines(text)
      .filter(({ line }) => /^-{3,}\s*\|/.test(line) || /^\|[^|]*$/.test(line.trim()))
      .map(({ no, line }) => `${no}: ${line.slice(0, 40)}`)
    expect(broken).toEqual([])
  })

  it('标题不重复', () => {
    const headings = proseLines(text)
      .map(({ line }) => line)
      .filter((l) => /^#{1,3} /.test(l))
    const duplicated = headings.filter((h, i) => headings.indexOf(h) !== i)
    expect(duplicated).toEqual([])
  })
})
