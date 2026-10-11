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

  it('分发到对应 action 并包装成功结果', async () => {
    const main = createRouter('data', handlers, withUser)
    const result = await main({ action: 'ping', payload: {} })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toMatchObject({ pong: true, openid: 'o_test' })
    }
  })

  it('payload 缺省时按空对象处理', async () => {
    const main = createRouter('data', handlers, withUser)
    const result = await main({ action: 'ping' })
    expect(result.ok).toBe(true)
  })

  it.each([
    ['非对象 event', 'ping'],
    ['null event', null],
    ['缺少 action', {}],
    ['未登记的 action', { action: 'drop' }],
    ['原型链上的属性名', { action: 'toString' }],
    ['payload 不是对象', { action: 'ping', payload: 'x' }],
    ['payload 是数组', { action: 'ping', payload: ['a'] }],
  ])('拒绝非法请求：%s', async (_name, event) => {
    const main = createRouter('data', handlers, withUser)
    const result = await main(event)
    expect(result).toEqual({
      ok: false,
      error: { code: 'BAD_REQUEST', message: expect.any(String) },
    })
  })

  it('拿不到 openid 时拒绝', async () => {
    const main = createRouter('data', handlers, () => ({}))
    const result = await main({ action: 'ping', payload: {} })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('UNAUTHORIZED')
  })

  it('AppError 原样透出给前端', async () => {
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

  it('未预期的异常转换为 INTERNAL，且不把内部信息透出', async () => {
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
    // 日志里不应出现 payload 内容
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('"p"')
  })
})
