import { describe, expect, it } from 'vitest'
import { ICON_NAMES, iconDataUri } from './icons'

describe('iconDataUri', () => {
  it('每个图标都能生成合法的 SVG data URI', () => {
    for (const name of ICON_NAMES) {
      const uri = iconDataUri(name)
      expect(uri.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
      const svg = decodeURIComponent(uri.split(',').slice(1).join(','))
      expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 24 24"[^>]*>.+<\/svg>$/)
    }
  })

  it('编码结果中不含会截断 CSS url() 的字符', () => {
    for (const name of ICON_NAMES) {
      expect(iconDataUri(name)).not.toMatch(/["'()\s]/)
    }
  })

  it('线宽写进 SVG，且按线宽分别缓存', () => {
    const thin = iconDataUri('mic', 1.5)
    const bold = iconDataUri('mic', 2.4)
    expect(thin).not.toBe(bold)
    expect(decodeURIComponent(bold)).toContain('stroke-width="2.4"')
    expect(iconDataUri('mic', 1.5)).toBe(thin)
  })
})
