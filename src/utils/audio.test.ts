import { describe, expect, it } from 'vitest'
import { formatDuration, pcmLevel } from './audio'

function frame(values: number[]): ArrayBuffer {
  return new Int16Array(values).buffer
}

describe('pcmLevel', () => {
  it('静音为 0', () => {
    expect(pcmLevel(frame(new Array(512).fill(0)))).toBe(0)
  })

  it('满幅接近 1', () => {
    expect(pcmLevel(frame(new Array(512).fill(32767)))).toBeCloseTo(1, 2)
  })

  it('音量越大值越大，且落在 0～1 之间', () => {
    const quiet = pcmLevel(frame(new Array(512).fill(300)))
    const loud = pcmLevel(frame(new Array(512).fill(8000)))
    expect(quiet).toBeGreaterThan(0)
    expect(loud).toBeGreaterThan(quiet)
    expect(loud).toBeLessThanOrEqual(1)
  })

  it('空帧和奇数字节不出错', () => {
    expect(pcmLevel(new ArrayBuffer(0))).toBe(0)
    expect(pcmLevel(new ArrayBuffer(3))).toBeGreaterThanOrEqual(0)
  })
})

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [7_400, '0:07'],
    [60_000, '1:00'],
    [-5, '0:00'],
  ])('%i → %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text)
  })
})
