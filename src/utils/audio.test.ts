import { describe, expect, it } from 'vitest'
import { formatDuration, pcmLevel } from './audio'

function frame(values: number[]): ArrayBuffer {
  return new Int16Array(values).buffer
}

describe('pcmLevel', () => {
  it('silence is 0', () => {
    expect(pcmLevel(frame(new Array(512).fill(0)))).toBe(0)
  })

  it('full scale is close to 1', () => {
    expect(pcmLevel(frame(new Array(512).fill(32767)))).toBeCloseTo(1, 2)
  })

  it('grows with volume and stays between 0 and 1', () => {
    const quiet = pcmLevel(frame(new Array(512).fill(300)))
    const loud = pcmLevel(frame(new Array(512).fill(8000)))
    expect(quiet).toBeGreaterThan(0)
    expect(loud).toBeGreaterThan(quiet)
    expect(loud).toBeLessThanOrEqual(1)
  })

  it('handles empty frames and odd byte counts', () => {
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
