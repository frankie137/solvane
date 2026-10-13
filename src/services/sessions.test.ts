import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@shared/types'
import { CloudError } from './cloud-error'

const getSessionMock = vi.fn<() => Promise<{ session: Session }>>()

vi.mock('./cloud', async () => {
  const { CloudError: Err } = await import('./cloud-error')
  return {
    CloudError: Err,
    callCloud: vi.fn((_fn: string, action: string) => {
      if (action === 'getSession') return getSessionMock()
      throw new Error(`unexpected ${action}`)
    }),
  }
})

const { runSessionJob } = await import('./sessions')

function session(patch: Partial<Session> = {}): Session {
  return {
    id: 's1',
    title: '',
    input: { mode: 'text', rawText: 'x' },
    polishedZh: '',
    versions: [],
    currentVid: null,
    job: null,
    lastError: null,
    starredAt: null,
    folderId: null,
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  }
}

const ready = session({
  versions: [
    {
      vid: 'v1',
      instruction: null,
      en: 'Hi',
      sentences: [],
      alternatives: [],
      analysis: null,
      createdAt: 0,
    },
  ],
})
const running = session({ job: { kind: 'generate', vid: null, startedAt: 0 } })
const isDone = (s: Session) => s.versions.length > 0
const fastPoll = { intervalMs: 0, timeoutMs: 1_000 }

describe('runSessionJob', () => {
  beforeEach(() => {
    getSessionMock.mockReset()
  })

  it('does not poll when the result comes back directly', async () => {
    const res = await runSessionJob('s1', async () => ({ session: ready }), { isDone })
    expect(res).toBe(ready)
    expect(getSessionMock).not.toHaveBeenCalled()
  })

  it('polls for the result after a request timeout', async () => {
    getSessionMock
      .mockResolvedValueOnce({ session: running })
      .mockResolvedValueOnce({ session: ready })
    const res = await runSessionJob(
      's1',
      async () => {
        throw new CloudError('TIMEOUT', '超时')
      },
      { isDone, poll: fastPoll },
    )
    expect(res).toBe(ready)
  })

  it('polls while another request is generating', async () => {
    getSessionMock.mockResolvedValueOnce({ session: ready })
    const res = await runSessionJob('s1', async () => ({ session: running }), {
      isDone,
      poll: fastPoll,
    })
    expect(res).toBe(ready)
  })

  it('throws the recorded error when the job fails', async () => {
    const failed = session({
      lastError: {
        kind: 'generate',
        vid: null,
        code: 'NOT_CONFIGURED',
        message: '还没有配置大模型',
        at: 0,
      },
    })
    getSessionMock.mockResolvedValueOnce({ session: failed })
    const err = await runSessionJob(
      's1',
      async () => {
        throw new CloudError('TIMEOUT', '超时')
      },
      { isDone, poll: fastPoll },
    ).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CloudError)
    expect(err).toMatchObject({ code: 'NOT_CONFIGURED', message: '还没有配置大模型' })
  })

  it('throws unrecoverable errors right away without polling', async () => {
    const err = await runSessionJob(
      's1',
      async () => {
        throw new CloudError('FORBIDDEN', '没有权限')
      },
      { isDone },
    ).catch((e: unknown) => e)
    expect(err).toMatchObject({ code: 'FORBIDDEN' })
    expect(getSessionMock).not.toHaveBeenCalled()
  })

  it('throws the original network error when the network failed and the job never ran', async () => {
    getSessionMock.mockResolvedValueOnce({ session: session() })
    const err = await runSessionJob(
      's1',
      async () => {
        throw new CloudError('NETWORK', '网络连接失败')
      },
      { isDone, poll: fastPoll },
    ).catch((e: unknown) => e)
    expect(err).toMatchObject({ code: 'NETWORK' })
  })

  it('stops polling after the page closes', async () => {
    getSessionMock.mockResolvedValue({ session: running })
    let closed = false
    const err = await runSessionJob(
      's1',
      async () => {
        closed = true
        return { session: running }
      },
      { isDone, isCancelled: () => closed, poll: fastPoll },
    ).catch((e: unknown) => e)
    expect(err).toMatchObject({ code: 'CANCELLED' })
    expect(getSessionMock).not.toHaveBeenCalled()
  })

  it('reports a timeout when the job never finishes', async () => {
    getSessionMock.mockResolvedValue({ session: running })
    const err = await runSessionJob('s1', async () => ({ session: running }), {
      isDone,
      poll: { intervalMs: 1, timeoutMs: 5 },
    }).catch((e: unknown) => e)
    expect(err).toMatchObject({ code: 'TIMEOUT' })
  })
})
