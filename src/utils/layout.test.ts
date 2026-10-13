import { describe, expect, it } from 'vitest'
import { computeNavMetrics } from './layout'

describe('computeNavMetrics', () => {
  it('computes the nav area height from the capsule button position (measured on iPhone 15)', () => {
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

  it('uses defaults when capsule info is invalid', () => {
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

  it('uses 0 for the bottom without safe-area info', () => {
    const m = computeNavMetrics({ windowWidth: 375, screenHeight: 667, safeArea: null })
    expect(m.safeAreaBottom).toBe(0)
    expect(m.statusBarHeight).toBe(20)
  })
})
