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

describe('模板约定', () => {
  // 小程序的样式隔离让父组件的样式选择器进不了子组件，
  // 给 sv-* 组件加 class 排版不会生效（M0 冒烟测试中发现），应在组件外或插槽内包一层 view
  it.each(files.map((f) => [relative(__dirname, f), f]))(
    '%s 没有给 sv-* 组件加 class',
    (_, file) => {
      const template = readFileSync(file, 'utf8').split('<script')[0] ?? ''
      const offenders = [...template.matchAll(/<sv-[a-z-]+\b[^>]*?\s:?class=/gs)].map((m) =>
        m[0].replace(/\s+/g, ' ').slice(0, 80),
      )
      expect(offenders).toEqual([])
    },
  )
})
