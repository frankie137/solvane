import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

function listVueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return listVueFiles(path)
    return name.endsWith('.vue') ? [path] : []
  })
}

const files = listVueFiles(__dirname)

describe('template conventions', () => {
  // Mini program style isolation keeps a parent's selectors out of child components,
  // so a layout class on an sv-* component has no effect (found during the M0 smoke test); wrap a view outside the component or inside the slot instead
  it.each(files.map((f) => [relative(__dirname, f), f]))(
    '%s puts no class on sv-* components',
    (_, file) => {
      const template = readFileSync(file, 'utf8').split('<script')[0] ?? ''
      const offenders = [...template.matchAll(/<sv-[a-z-]+\b[^>]*?\s:?class=/gs)].map((m) =>
        m[0].replace(/\s+/g, ' ').slice(0, 80),
      )
      expect(offenders).toEqual([])
    },
  )

  // Component styles are isolated too, so a tab can't rely on another tab's .tab-scroll rule;
  // without a height its scroll-view grows with the content and can't scroll (found during M7)
  it.each(
    files
      .filter((f) => /class="tab-scroll"/.test(readFileSync(f, 'utf8')))
      .map((f) => [relative(__dirname, f), f]),
  )('%s gives its .tab-scroll a height', (_, file) => {
    const style = readFileSync(file, 'utf8').split('<style')[1] ?? ''
    expect(style).toMatch(/\.tab-scroll\s*\{[^}]*height:\s*100%/)
  })
})
