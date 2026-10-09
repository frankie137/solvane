import { describe, expect, it, vi } from 'vitest'
import { pollUntil } from './poll'

function fakeClock() {
  let t = 0
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms
    },
  }
}

describe('pollUntil', () => {
  it('满足条件时返回', async () => {
    const clock = fakeClock()
    const load = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(3)
    const res = await pollUntil(load, (v) => v === 3, {
      intervalMs: 100,
      timeoutMs: 10_000,
      ...clock,
    })
    expect(res).toEqual({ value: 3, timedOut: false })
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('单次失败不中断', async () => {
    const clock = fakeClock()
    const load = vi.fn().mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce('ok')
    const res = await pollUntil(load, (v) => v === 'ok', {
      intervalMs: 100,
      timeoutMs: 10_000,
      ...clock,
    })
    expect(res.value).toBe('ok')
  })

  it('超时返回最后一次的值', async () => {
    const clock = fakeClock()
    const load = vi.fn().mockResolvedValue('still running')
    const res = await pollUntil(load, () => false, {
      intervalMs: 1_000,
      timeoutMs: 3_000,
      ...clock,
    })
    expect(res).toEqual({ value: 'still running', timedOut: true })
    expect(load).toHaveBeenCalledTimes(3)
  })
})
