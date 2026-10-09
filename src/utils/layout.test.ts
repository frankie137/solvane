import { describe, expect, it } from 'vitest'
import { computeNavMetrics } from './layout'

describe('computeNavMetrics', () => {
  it('按胶囊按钮位置计算导航区高度（iPhone 15 实测数据）', () => {
    const m = computeNavMetrics({
      statusBarHeight: 59,
      windowWidth: 393,
      screenHeight: 852,
      safeArea: { bottom: 818 },
      menuButton: { top: 63, height: 32, left: 296 },
    })
    expect(m.navBarHeight).toBe(40)
    expect(m.totalHeight).toBe(99)
    expect(m.capsuleReserve).toBe(97)
    expect(m.safeAreaBottom).toBe(34)
  })

  it('胶囊信息无效时使用默认值', () => {
    const m = computeNavMetrics({
      statusBarHeight: 20,
      windowWidth: 375,
      screenHeight: 667,
      menuButton: { top: 0, height: 0, left: 0 },
    })
    expect(m.navBarHeight).toBe(44)
    expect(m.capsuleReserve).toBe(96)
    expect(m.totalHeight).toBe(64)
  })

  it('没有安全区信息时底部为 0', () => {
    const m = computeNavMetrics({ windowWidth: 375, screenHeight: 667, safeArea: null })
    expect(m.safeAreaBottom).toBe(0)
    expect(m.statusBarHeight).toBe(20)
  })
})
