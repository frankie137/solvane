import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..')
const docs = [
  'README.md',
  'CLAUDE.md',
  'CHANGELOG.md',
  'docs/REVIEW.md',
  ...readdirSync(join(root, 'docs/stages')).map((f) => `docs/stages/${f}`),
]

/** Content inside code blocks is not checked */
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

  // Replacing a whole section can mistake a table separator row for a section rule and leave half a table behind (found in the README during M2)
  it('has no broken table rows', () => {
    const broken = proseLines(text)
      .filter(({ line }) => /^-{3,}\s*\|/.test(line) || /^\|[^|]*$/.test(line.trim()))
      .map(({ no, line }) => `${no}: ${line.slice(0, 40)}`)
    expect(broken).toEqual([])
  })

  it('has no duplicate headings', () => {
    const headings = proseLines(text)
      .map(({ line }) => line)
      .filter((l) => /^#{1,3} /.test(l))
    const duplicated = headings.filter((h, i) => headings.indexOf(h) !== i)
    expect(duplicated).toEqual([])
  })
})
