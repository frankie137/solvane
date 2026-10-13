import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const componentsDir = join(__dirname, 'components')
const declarations = readFileSync(join(__dirname, 'components.d.ts'), 'utf8')

const toPascal = (name: string) =>
  name
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')

describe('components.d.ts', () => {
  const names = readdirSync(componentsDir).filter((n) => n.startsWith('sv-'))

  it.each(names)('%s is declared as a global component type', (name) => {
    expect(declarations).toContain(
      `${toPascal(name)}: (typeof import('./components/${name}/${name}.vue'))['default']`,
    )
  })
})
