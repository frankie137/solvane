import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../src/lib/errors'
import { chat, resetJsonModeCache, type FetchLike, type LlmTarget } from '../src/lib/llm/client'
import { chatJson, extractJsonObject } from '../src/lib/llm/json'
import { z } from 'zod'

const target: LlmTarget = {
  baseUrl: 'https://api.example.com/v1',
  model: 'm',
  apiKey: 'sk-secretkey123',
}

const reply = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
const failure = (status: number, body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })

function fetchSequence(...responses: (Response | Error)[]) {
  const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] =
    []
  const impl: FetchLike = async (url, init) => {
    calls.push({
      url,
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
      headers: init.headers as Record<string, string>,
    })
    const next = responses.shift()
    if (!next) throw new Error('unexpected call')
    if (next instanceof Error) throw next
    return next
  }
  return { impl, calls }
}

async function expectAppError(p: Promise<unknown>, code: string, includes?: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(AppError)
  expect((err as AppError).code).toBe(code)
  if (includes) expect((err as AppError).message).toContain(includes)
  return err as AppError
}

beforeEach(() => {
  resetJsonModeCache()
})

describe('chat', () => {
  it('requests /chat/completions and returns the content', async () => {
    const { impl, calls } = fetchSequence(reply('hello'))
    await expect(
      chat(target, [{ role: 'user', content: 'hi' }], { timeoutMs: 1000, json: true }, impl),
    ).resolves.toBe('hello')
    expect(calls[0]!.url).toBe('https://api.example.com/v1/chat/completions')
    expect(calls[0]!.headers.Authorization).toBe('Bearer sk-secretkey123')
    expect(calls[0]!.body.response_format).toEqual({ type: 'json_object' })
    expect(calls[0]!.body.model).toBe('m')
  })

  it('retries without the parameter when the provider does not support JSON mode', async () => {
    const { impl, calls } = fetchSequence(
      failure(400, { error: { message: 'response_format is not supported' } }),
      reply('{"a":1}'),
    )
    await expect(chat(target, [], { timeoutMs: 1000, json: true }, impl)).resolves.toBe('{"a":1}')
    expect(calls).toHaveLength(2)
    expect(calls[1]!.body.response_format).toBeUndefined()
  })

  it('remembers models without JSON mode and skips the failing first attempt afterwards', async () => {
    const { impl, calls } = fetchSequence(
      failure(400, { error: { message: 'response_format is not supported' } }),
      reply('{"a":1}'),
      reply('{"a":2}'),
    )
    await chat(target, [], { timeoutMs: 1000, json: true }, impl)
    await chat(target, [], { timeoutMs: 1000, json: true }, impl)
    expect(calls).toHaveLength(3)
    expect(calls[2]!.body.response_format).toBeUndefined()
  })

  it.each([
    [401, 'API Key 无效'],
    [404, '接口地址或模型名不正确'],
    [429, '额度'],
    [503, '暂时不可用'],
  ])('HTTP %i gives the matching message', async (status, text) => {
    const { impl } = fetchSequence(failure(status, { error: { message: 'x' } }))
    await expectAppError(chat(target, [], { timeoutMs: 1000 }, impl), 'UPSTREAM_ERROR', text)
  })

  it('hides the key in upstream error messages', async () => {
    const { impl } = fetchSequence(
      failure(400, { error: { message: 'invalid key sk-secretkey123 for model' } }),
    )
    const err = await expectAppError(chat(target, [], { timeoutMs: 1000 }, impl), 'UPSTREAM_ERROR')
    expect(err.message).not.toContain('sk-secretkey123')
    expect(err.message).toContain('***')
  })

  it('keeps the error message readable when the key is empty', async () => {
    const { impl } = fetchSequence(failure(401, { error: { message: 'invalid key' } }))
    const err = await expectAppError(
      chat({ ...target, apiKey: '' }, [], { timeoutMs: 1000 }, impl),
      'UPSTREAM_ERROR',
    )
    expect(err.message).toContain('invalid key')
  })

  it('converts a timeout to TIMEOUT', async () => {
    const impl: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        )
      })
    await expectAppError(chat(target, [], { timeoutMs: 10 }, impl), 'TIMEOUT')
  })

  it('suggests checking the base URL on network errors', async () => {
    const { impl } = fetchSequence(new TypeError('fetch failed'))
    await expectAppError(chat(target, [], { timeoutMs: 1000 }, impl), 'UPSTREAM_ERROR', '接口地址')
  })

  it('rejects an empty reply', async () => {
    const { impl } = fetchSequence(reply('   '))
    await expectAppError(chat(target, [], { timeoutMs: 1000 }, impl), 'UPSTREAM_ERROR', '空内容')
  })
})

describe('extractJsonObject', () => {
  it.each([['{"a":1}'], ['```json\n{"a":1}\n```'], ['好的，结果如下：\n{"a":1}\n希望有帮助']])(
    'parses %j',
    (text) => {
      expect(extractJsonObject(text)).toEqual({ a: 1 })
    },
  )

  it('throws when there is no JSON', () => {
    expect(() => extractJsonObject('no json')).toThrow()
  })
})

describe('chatJson', () => {
  const schema = z.object({ a: z.number() })

  it('feeds problems back to the model for one correction when the format is wrong', async () => {
    const { impl, calls } = fetchSequence(reply('{"a":"x"}'), reply('{"a":2}'))
    await expect(
      chatJson(target, [{ role: 'user', content: 'q' }], schema, {
        deadline: Date.now() + 60_000,
        fetchImpl: impl,
      }),
    ).resolves.toEqual({ a: 2 })
    const retryMessages = calls[1]!.body.messages as { role: string; content: string }[]
    expect(retryMessages.at(-2)).toEqual({ role: 'assistant', content: '{"a":"x"}' })
    expect(retryMessages.at(-1)!.content).toContain('a')
  })

  it('fails if the correction is still wrong', async () => {
    const { impl } = fetchSequence(reply('nope'), reply('still nope'))
    await expectAppError(
      chatJson(target, [], schema, { deadline: Date.now() + 60_000, fetchImpl: impl }),
      'UPSTREAM_ERROR',
    )
  })

  it('does not retry when too little time is left', async () => {
    let now = 0
    const { impl, calls } = fetchSequence(reply('bad'))
    const p = chatJson(target, [], schema, {
      deadline: 10_000,
      now: () => now,
      fetchImpl: async (url, init) => {
        now = 5_000 // The first request uses up half the time
        return impl(url, init)
      },
    })
    await expectAppError(p, 'UPSTREAM_ERROR')
    expect(calls).toHaveLength(1)
  })

  it('caps a single request timeout at the remaining time', async () => {
    const spy = vi.fn<FetchLike>(async () => reply('{"a":1}'))
    await chatJson(target, [], schema, {
      deadline: 3_000,
      now: () => 0,
      maxRequestMs: 45_000,
      fetchImpl: spy,
    })
    expect(spy).toHaveBeenCalledOnce()
  })
})
