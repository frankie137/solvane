import { describe, expect, it } from 'vitest'
import { ICON_NAMES, iconDataUri } from './icons'

describe('iconDataUri', () => {
  it('generates a valid SVG data URI for every icon', () => {
    for (const name of ICON_NAMES) {
      const uri = iconDataUri(name)
      expect(uri.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
      const svg = decodeURIComponent(uri.split(',').slice(1).join(','))
      expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 24 24"[^>]*>.+<\/svg>$/)
    }
  })

  it('encodes no characters that would cut off a CSS url()', () => {
    for (const name of ICON_NAMES) {
      expect(iconDataUri(name)).not.toMatch(/["'()\s]/)
    }
  })

  it('writes the stroke width into the SVG and caches per stroke width', () => {
    const thin = iconDataUri('mic', 1.5)
    const bold = iconDataUri('mic', 2.4)
    expect(thin).not.toBe(bold)
    expect(decodeURIComponent(bold)).toContain('stroke-width="2.4"')
    expect(iconDataUri('mic', 1.5)).toBe(thin)
  })
})
