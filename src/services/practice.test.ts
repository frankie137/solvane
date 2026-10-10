import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Practice } from '@shared/types'
import type * as PollModule from '@/utils/poll'
import { CloudError } from './cloud-error'

const advance = vi.fn<() => Promise<{ practice: Practice }>>()
const get = vi.fn<() => Promise<{ practice: Practice }>>()

vi.mock('./cloud', async () => {
  const { CloudError: Err } = await import('./cloud-error')
  return {
    CloudError: Err,
    uploadFile: vi.fn(),
    callCloud: vi.fn((_fn: string, action: string) => {
      if (action === 'advance') return advance()
      if (action === 'get') return get()
      throw new Error(`unexpected ${action}`)
    }),
  }
})

vi.mock('@/utils/poll', async () => {
  const real = await vi.importActual<typeof PollModule>('@/utils/poll')
  return {
    pollUntil: (load: () => Promise<unknown>, done: (v: never) => boolean, o: object) =>
      real.pollUntil(load, done as (v: unknown) => boolean, { ...o, intervalMs: 0, timeoutMs: 50 }),
  }
})

const { runPractice } = await import('./practice')

function practice(patch: Partial<Practice>): Practice {
  return {
    id: 'p1',
    sessionId: 's1',
    vid: 'v1',
    stage: 'transcribe',
    job: null,
    lastError: null,
    durationMs: 1000,
    audioUrl: null,
    transcript: null,
    alignment: null,
    pronunciation: null,
    report: null,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  }
}

describe('runPractice', () => {
  beforeEach(() => {
    advance.mockReset()
    get.mockReset()
  })

  it('一次调用完成', async () => {
    advance.mockResolvedValueOnce({ practice: practice({ stage: 'done' }) })
    const res = await runPractice('p1')
    expect(res.stage).toBe('done')
    expect(advance).toHaveBeenCalledOnce()
  })

  it('没完成时继续推进，并报告每一步的进度', async () => {
    advance
      .mockResolvedValueOnce({ practice: practice({ stage: 'score' }) })
      .mockResolvedValueOnce({ practice: practice({ stage: 'done' }) })
    const stages: string[] = []
    await runPractice('p1', { onUpdate: (p) => stages.push(p.stage) })
    expect(stages).toEqual(['score', 'done'])
  })

  it('请求超时后轮询，等这一步结束再继续', async () => {
    advance
      .mockRejectedValueOnce(new CloudError('TIMEOUT', '超时'))
      .mockResolvedValueOnce({ practice: practice({ stage: 'done' }) })
    get
      .mockResolvedValueOnce({
        practice: practice({ stage: 'align', job: { stage: 'align', startedAt: 1 } }),
      })
      .mockResolvedValueOnce({ practice: practice({ stage: 'score' }) })
    const res = await runPractice('p1')
    expect(res.stage).toBe('done')
    expect(advance).toHaveBeenCalledTimes(2)
  })

  it('某一步失败时抛出记录的错误', async () => {
    advance.mockResolvedValueOnce({
      practice: practice({
        stage: 'score',
        lastError: { stage: 'score', code: 'NOT_CONFIGURED', message: '口语评测鉴权失败', at: 1 },
      }),
    })
    await expect(runPractice('p1')).rejects.toMatchObject({ code: 'NOT_CONFIGURED' })
  })

  it('不可恢复的错误直接抛出', async () => {
    advance.mockRejectedValueOnce(new CloudError('BAD_REQUEST', '没有听清'))
    await expect(runPractice('p1')).rejects.toMatchObject({ message: '没有听清' })
    expect(get).not.toHaveBeenCalled()
  })

  it('页面关闭后不再推进', async () => {
    await expect(runPractice('p1', { isCancelled: () => true })).rejects.toMatchObject({
      code: 'CANCELLED',
    })
    expect(advance).not.toHaveBeenCalled()
  })
})
