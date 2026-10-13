import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../src/lib/errors'
import { createRouter } from '../src/lib/router'
import { createDataHandlers } from '../src/functions/data/handlers'
import { createMemoryRepos } from './support/memory-repos'
import { createMemoryStorage } from './support/memory-storage'

const handlers = createDataHandlers({
  repos: createMemoryRepos(),
  now: () => 1000,
  storage: createMemoryStorage(),
  newFileName: () => 'f',
  adminOpenids: () => [],
})

const withUser = () => ({ openid: 'o_test', appid: 'wx_test' })

describe('createRouter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('dispatches to the matching action and wraps a success result', async () => {
    const main = createRouter('data', handlers, withUser)
    const result = await main({ action: 'ping', payload: {} })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toMatchObject({ pong: true, openid: 'o_test' })
    }
  })

  it('treats a missing payload as an empty object', async () => {
    const main = createRouter('data', handlers, withUser)
    const result = await main({ action: 'ping' })
    expect(result.ok).toBe(true)
  })

  it.each([
    ['non-object event', 'ping'],
    ['null event', null],
    ['missing action', {}],
    ['unregistered action', { action: 'drop' }],
    ['prototype property name', { action: 'toString' }],
    ['non-object payload', { action: 'ping', payload: 'x' }],
    ['array payload', { action: 'ping', payload: ['a'] }],
  ])('rejects invalid request: %s', async (_name, event) => {
    const main = createRouter('data', handlers, withUser)
    const result = await main(event)
    expect(result).toEqual({
      ok: false,
      error: { code: 'BAD_REQUEST', message: expect.any(String) },
    })
  })

  it('rejects when openid is unavailable', async () => {
    const main = createRouter('data', handlers, () => ({}))
    const result = await main({ action: 'ping', payload: {} })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('UNAUTHORIZED')
  })

  it('passes AppError through to the frontend as is', async () => {
    const main = createRouter(
      'data',
      {
        ...handlers,
        async ping() {
          throw new AppError('NOT_CONFIGURED', '还没有配置大模型')
        },
      },
      withUser,
    )
    const result = await main({ action: 'ping', payload: {} })
    expect(result).toEqual({
      ok: false,
      error: { code: 'NOT_CONFIGURED', message: '还没有配置大模型' },
    })
  })

  it('converts unexpected errors to INTERNAL without leaking internals', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const main = createRouter(
      'data',
      {
        ...handlers,
        async ping() {
          throw new Error('secret=sk-123 leaked')
        },
      },
      withUser,
    )
    const result = await main({ action: 'ping', payload: { secret: 'p' } })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL')
      expect(result.error.message).not.toContain('sk-123')
    }
    // The log must not contain payload contents
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('"p"')
  })
})
