import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Practice } from '@shared/types'
import type * as PollModule from '@/utils/poll'
import { CloudError } from './cloud-error'

const advance = vi.fn<() => Promise<{ practice: Practice }>>()
const get = vi.fn<() => Promise<{ practice: Practice }>>()
const actions: string[] = []

vi.mock('./cloud', async () => {
  const { CloudError: Err } = await import('./cloud-error')
  return {
    CloudError: Err,
    uploadFile: vi.fn(),
    callCloud: vi.fn((_fn: string, action: string) => {
      actions.push(action)
      if (action === 'score' || action === 'prepareShare') return advance()
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
    scoreRequested: true,
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
    actions.length = 0
  })

  it('finishes in a single call', async () => {
    advance.mockResolvedValueOnce({ practice: practice({ stage: 'done' }) })
    const res = await runPractice('p1', 'score')
    expect(res.stage).toBe('done')
    expect(advance).toHaveBeenCalledOnce()
  })

  it('keeps advancing until done and reports progress for each step', async () => {
    advance
      .mockResolvedValueOnce({ practice: practice({ stage: 'score' }) })
      .mockResolvedValueOnce({ practice: practice({ stage: 'done' }) })
    const stages: string[] = []
    await runPractice('p1', 'score', { onUpdate: (p) => stages.push(p.stage) })
    expect(stages).toEqual(['score', 'done'])
  })

  it('polls after a request timeout and continues once the step finishes', async () => {
    advance
      .mockRejectedValueOnce(new CloudError('TIMEOUT', '超时'))
      .mockResolvedValueOnce({ practice: practice({ stage: 'done' }) })
    get
      .mockResolvedValueOnce({
        practice: practice({ stage: 'align', job: { stage: 'align', startedAt: 1 } }),
      })
      .mockResolvedValueOnce({ practice: practice({ stage: 'score' }) })
    const res = await runPractice('p1', 'score')
    expect(res.stage).toBe('done')
    expect(advance).toHaveBeenCalledTimes(2)
  })

  it('throws the recorded error when a step fails', async () => {
    advance.mockResolvedValueOnce({
      practice: practice({
        stage: 'score',
        lastError: { stage: 'score', code: 'NOT_CONFIGURED', message: '口语评测鉴权失败', at: 1 },
      }),
    })
    await expect(runPractice('p1', 'score')).rejects.toMatchObject({ code: 'NOT_CONFIGURED' })
  })

  it('throws unrecoverable errors right away', async () => {
    advance.mockRejectedValueOnce(new CloudError('BAD_REQUEST', '没有听清'))
    await expect(runPractice('p1', 'score')).rejects.toMatchObject({ message: '没有听清' })
    expect(get).not.toHaveBeenCalled()
  })

  it('calls the scoring action every round (the cloud never deducts twice)', async () => {
    advance
      .mockResolvedValueOnce({ practice: practice({ stage: 'score' }) })
      .mockResolvedValueOnce({ practice: practice({ stage: 'done' }) })
    await runPractice('p1', 'score')
    expect(actions).toEqual(['score', 'score'])
  })

  it('stops after alignment when preparing to share', async () => {
    advance.mockResolvedValueOnce({
      practice: practice({
        stage: 'score',
        scoreRequested: false,
        alignment: { sentences: [], diffs: [], content: 0, expression: 0 },
      }),
    })
    const res = await runPractice('p1', 'share')
    expect(res.stage).toBe('score')
    expect(actions).toEqual(['prepareShare'])
  })

  it('stops advancing after the page closes', async () => {
    await expect(runPractice('p1', 'score', { isCancelled: () => true })).rejects.toMatchObject({
      code: 'CANCELLED',
    })
    expect(advance).not.toHaveBeenCalled()
  })
})
